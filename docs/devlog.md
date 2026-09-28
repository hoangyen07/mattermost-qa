# Devlog

Nhật ký quá trình xây dựng project: mỗi ngày làm gì, gặp vấn đề gì và xử lý ra sao.
Tổng quan project xem ở [README](../README.md).

---

## Ngày 1 — 27/09/2026: Dựng môi trường Mattermost bằng Docker

### Mục tiêu
Có một server Mattermost chạy local, gồm app và PostgreSQL, để làm hệ thống cần test (SUT) cho các tầng API, Web, Mobile và DB.
Chỉ cần một lệnh `docker compose up -d` là dựng được, và reset về môi trường sạch cũng dễ.

### Đã làm
File [`docker/docker-compose.yml`](../docker/docker-compose.yml) gồm 2 service:

| Service | Image | Vai trò |
|---|---|---|
| `db` (`mm-db`) | `postgres:16-alpine` | Database; mở cổng `5432` ra host để verify dữ liệu trực tiếp khi test |
| `mattermost` (`mm-app`) | `mattermost/mattermost-team-edition:11.11.1` | App chat, mở ở `http://localhost:8065` |

Các quyết định chính:
- **Volumes** (`db-data`, `mm-data`, `mm-config`) để dữ liệu không mất khi restart. Khi cần môi trường sạch thì chạy `docker compose down -v`.
- **`depends_on` + `service_healthy`**: app chỉ khởi động khi DB đã sẵn sàng nhận kết nối.
- **Cấu hình bằng biến `MM_*`**:
  - `ENABLELOCALMODE=true`: dùng được `mmctl --local` để seed dữ liệu mà không cần đăng nhập.
  - `ENABLEOPENSERVER=true`: cho phép tự đăng ký user test.
  - `RATELIMITSETTINGS_ENABLE=false`: tắt rate limit để chạy perf test bằng k6.
- **Cố định version `11.11.1`** thay vì `latest`, để kết quả test giữa các lần chạy so sánh được với nhau.

### Vấn đề gặp phải

**1. `no matching manifest for linux/arm64/v8`**
- *Hiện tượng:* `docker compose up` báo lỗi khi pull image Mattermost.
- *Nguyên nhân:* máy dev là Mac chip Apple (arm64). Kiểm tra bằng `docker manifest inspect` thì cả image Team và Enterprise đều chỉ có bản `amd64`.
- *Cách sửa:* thêm `platform: linux/amd64` để Docker Desktop chạy image qua giả lập. App chạy chậm hơn một chút, không ảnh hưởng việc test chức năng.

**2. Container báo `unhealthy` dù app vẫn chạy bình thường**
- *Hiện tượng:* `curl http://localhost:8065/api/v4/system/ping` từ host vẫn trả về `status: OK`, nhưng `docker compose ps` báo `unhealthy`.
- *Nguyên nhân:* đọc log healthcheck bằng `docker inspect` thì thấy lỗi `stat /bin/sh: no such file or directory`. Image Mattermost mới là dạng **distroless**, không có shell và không có `curl`, nên healthcheck kiểu `CMD-SHELL curl ...` không bao giờ chạy được.
- *Cách sửa:* dùng binary có sẵn trong image:
  ```yaml
  test: ["CMD", "/mattermost/bin/mmctl", "--local", "system", "status"]
  ```
  Lệnh này kiểm tra được cả trạng thái DB và nơi lưu file, nên đáng tin hơn chỉ ping HTTP.
- *Bài học:* một healthcheck lúc nào cũng báo lỗi thì không phản ánh gì về app. Cần kiểm tra chính healthcheck có chạy được không, chứ không chỉ xem kết quả.

### Kiểm tra kết quả
```bash
docker compose ps                                        # cả 2 container: healthy
docker exec mm-app /mattermost/bin/mattermost version    # Version: 11.11.1
docker exec -it mm-db psql -U mmuser -d mattermost       # xem dữ liệu
```
Đã tạo tài khoản admin và team đầu tiên qua UI. Query DB thấy đúng user, team và channel mặc định (`town-square`, `off-topic`).

### Ghi chú cho các ngày sau
- Image distroless: không chạy được `docker exec -it mm-app sh`, phải gọi thẳng binary như `mmctl` hoặc `mattermost`.
- Thời gian trong DB lưu dạng epoch mili-giây, đọc bằng `to_timestamp(createat/1000)`.
- Dữ liệu bị xóa không mất khỏi DB, chỉ được đánh dấu qua cột `deleteat`, nên khi đếm phải lọc `deleteat = 0`.
- Setting đặt bằng biến `MM_*` sẽ bị khóa trong System Console.

### Lệnh hay dùng
Chạy từ thư mục gốc của repo.

**Bật / tắt môi trường**

| Lệnh | Tác dụng | Dữ liệu |
|---|---|---|
| `docker compose -f docker/docker-compose.yml up -d` | Bật (hoặc áp dụng thay đổi config) | Giữ |
| `docker compose -f docker/docker-compose.yml stop` | Tạm dừng container | Giữ |
| `docker compose -f docker/docker-compose.yml down` | Tắt và xóa container | Giữ (còn trong volume) |
| `docker compose -f docker/docker-compose.yml down -v` | Tắt và xóa cả volume, dùng để reset môi trường sạch | **Mất hết** |

**Vào / thoát psql**
```bash
docker exec -it mm-db psql -U mmuser -d mattermost   # vào psql
```
- Thoát: gõ `\q` rồi Enter, hoặc nhấn `Ctrl + D`.
- Đang xem kết quả dài (thấy `:` hoặc `(END)`): nhấn `q` trước, rồi mới `\q`.
- Dấu nhắc đổi thành `mattermost-#` nghĩa là đang gõ dở một câu lệnh (thường do thiếu `;`): nhấn `Ctrl + C` để hủy câu đó.
- Thoát psql không tắt database, container `mm-db` vẫn chạy.

### Tiếp theo
- Viết script seed dữ liệu (admin, team, user test) bằng `mmctl` hoặc API.
- Khởi tạo project TypeScript + Playwright và viết test API đầu tiên.

---

## Ngày 2 — 28/09/2026: Cài Playwright, đọc hiểu config, viết test login đầu tiên

### Mục tiêu
- Khởi tạo project TypeScript và cài Playwright.
- Hiểu từng option trong `playwright.config.ts`, không chỉ dùng config mẫu.
- Viết test login đầu tiên theo Page Object Model, gồm cả trường hợp đúng và sai mật khẩu.

### Đã làm
- [x] `npm init`, cài `@playwright/test` 1.63, `typescript`, `@types/node`, `dotenv`; `npx playwright install chromium`
- [x] Tạo user test `qaadmin` và team `qa-team` bằng `mmctl --local`
- [x] `.env` + `src/config/env.ts`: đọc biến môi trường, báo lỗi ngay nếu thiếu biến
- [ ] `.env.example`: bản mẫu của `.env` để commit, giúp người clone biết cần khai báo biến nào
- [x] `playwright.config.ts`
- [x] Page Object `web/pages/LoginPage.ts`
- [x] Test `tests/web/login.spec.ts`: đăng nhập thành công + sai mật khẩu
- [x] Chạy test, xem HTML report và trace

Cấu trúc sau Ngày 2:
```
playwright.config.ts
src/config/env.ts          – đọc & validate biến môi trường
web/pages/LoginPage.ts     – Page Object của trang login
tests/web/login.spec.ts    – 2 test login
```

### Đọc hiểu `playwright.config.ts`

| Option | Tác dụng |
|---|---|
| `testDir` | Thư mục chứa file test (`*.spec.ts`) |
| `fullyParallel` | Chạy các test song song, nên mỗi test phải độc lập với nhau |
| `forbidOnly` | Trên CI, báo lỗi nếu lỡ commit `test.only` |
| `retries` | Số lần chạy lại khi fail. Local để 0 để thấy lỗi thật, CI để 2 |
| `reporter` | `list` in kết quả ra terminal, `html` tạo báo cáo xem bằng trình duyệt |
| `use.baseURL` | Cho phép viết `page.goto('/login')` thay vì URL đầy đủ |
| `use.trace` | `retain-on-failure`: ghi lại toàn bộ quá trình khi test fail để xem lại từng bước |
| `use.screenshot` | `only-on-failure`: chụp màn hình khi fail |
| `projects` | Nhóm test chạy chung một cấu hình. `name` dùng với `--project=web`, `testDir` riêng ghi đè `testDir` chung, `devices['Desktop Chrome']` là bộ cấu hình có sẵn (Chromium, viewport 1280×720, user agent) |

`forbidOnly: !!process.env.CI`: CI tự đặt biến `CI=true`, còn máy local thì không có biến này. `!!` đổi giá trị đó thành boolean, nên chỉ trên CI mới cấm `test.only`. Local vẫn dùng `.only` để debug được.

`reporter` nhận một mảng nên dùng được nhiều reporter cùng lúc. `html` mặc định `open: 'on-failure'`, tức là tự mở trình duyệt và giữ terminal khi có test fail. Đặt `'never'` để tự mở bằng `npx playwright show-report`.

**2 option không khai báo (dùng mặc định):**

| Option | Mặc định | Khi nào nên thêm |
|---|---|---|
| `workers` | Một nửa số nhân CPU | Giảm khi test fail thất thường do timeout (server chạy giả lập amd64 khá chậm), hoặc trên CI: `workers: process.env.CI ? 2 : undefined` |
| `video` | `'off'` | Khi cần gửi bằng chứng lỗi cho dev. Trace đã chi tiết hơn video nên chưa cần |

**Worker là gì:** mỗi worker là một tiến trình Node.js riêng, có trình duyệt riêng và chạy test song song với các worker khác. Mỗi test nhận một browser context sạch, giống cửa sổ ẩn danh. Các test không biết thứ tự chạy, nên không được phụ thuộc vào nhau hay dùng chung dữ liệu. Với `fullyParallel: true`, cả các test trong cùng một file cũng được chia ra nhiều worker.

`trace: 'on-first-retry'` là giá trị hay gặp trong config mẫu. Nhưng nếu local để `retries: 0` thì trace không bao giờ được ghi, nên chọn `retain-on-failure`.

### Tìm hiểu trang login (trước khi viết test)
Mở trang bằng Playwright và đọc cây accessibility (`ariaSnapshot`) để chọn locator.

**1. Có một trang trung gian trước form login**
- *Hiện tượng:* mở `/login` thì thấy trang "Where would you like to view this?" (mở bằng Desktop App hay trình duyệt), không phải form login. Nếu không xử lý, test sẽ timeout vì không tìm thấy ô nhập.
- *Nguyên nhân:* Mattermost hỏi người dùng lần đầu, rồi ghi nhớ lựa chọn bằng giá trị `__landingPageSeen__` trong localStorage.
- *Cách xử lý:* đặt sẵn giá trị này trước khi mở trang, như vậy ổn định hơn là tìm và bấm nút "View in Browser":
  ```ts
  await page.addInitScript(() => localStorage.setItem('__landingPageSeen__', 'true'));
  ```
- *Vì sao phải dùng `addInitScript`:* localStorage lưu riêng theo từng origin.
  - Nếu set trước `goto`, trang đang là `about:blank`, giá trị bị ghi sai origin.
  - Nếu set sau `goto`, Mattermost đã đọc localStorage và vẽ trang trung gian rồi, quá muộn.
  - `addInitScript` chạy trên trang mới **trước** JavaScript của app, và chạy lại ở mỗi lần chuyển trang.
  - Lưu ý: hàm này chạy trong trình duyệt, không chạy trong Node, nên không dùng được biến bên ngoài hàm.

**2. Locator chọn dùng** (theo role, ít bị thay đổi hơn id CSS)

| Thành phần | Locator |
|---|---|
| Ô username | `getByRole('textbox', { name: 'Email or Username' })` |
| Ô password | `getByRole('textbox', { name: 'Password', exact: true })`. Cần `exact` vì có nút "Show password" |
| Nút đăng nhập | `getByRole('button', { name: 'Log in' })` |
| Lỗi sai mật khẩu | `getByText('The email/username or password is invalid.')` |

**3. Kết quả mong đợi**
- Đăng nhập đúng: chuyển đến `/qa-team/channels/town-square`.
- Sai mật khẩu: vẫn ở `/login`, hiện dòng lỗi và 2 ô nhập bị đánh dấu `invalid`.

### Vấn đề gặp phải
- Docker Desktop chưa bật nên `docker compose` báo lỗi `failed to connect to the docker API`. Cách sửa: mở Docker Desktop trước, rồi chạy `up -d --wait`.
- **Tên file khác chữ hoa/thường với câu import:** file đặt tên `loginPage.ts`, nhưng test lại import `'../../web/pages/LoginPage'`. Trên Mac vẫn chạy được, vì hệ thống file của macOS mặc định không phân biệt chữ hoa chữ thường. Trên CI chạy Linux thì sẽ lỗi `Cannot find module`. Cách sửa: đặt tên file trùng tên class là `LoginPage.ts`, đổi tên bằng `git mv` để git ghi nhận thay đổi chữ hoa/thường.

### Kiểm tra kết quả
```
$ npx playwright test

Running 2 tests using 2 workers

  ✓  2 [web] › tests/web/login.spec.ts:6:9 › Login › logs in with valid credentials (2.7s)
  ✓  1 [web] › tests/web/login.spec.ts:13:9 › Login › shows an error with a wrong password (2.7s)

  2 passed (3.0s)
```
Hai test chạy song song trên 2 worker, nên tổng thời gian (3.0s) gần bằng thời gian của một test.
Thử cố tình làm test fail (sửa URL mong đợi thành sai) rồi mở `npx playwright show-report` thì thấy được ảnh chụp màn hình và trace của lần chạy lỗi.

### Ghi chú cho các ngày sau
- Mattermost khóa tài khoản sau 10 lần đăng nhập sai liên tiếp (`MaximumLoginAttempts`). Test sai mật khẩu nên dùng user riêng để không khóa `qaadmin`.
- `expect(...)` của Playwright tự chờ điều kiện đúng (mặc định 5s), nên không dùng `waitForTimeout`.
- Cờ `--wait` của `docker compose up` giúp lệnh chỉ kết thúc khi container đã `healthy`, rất tiện cho CI.

### Tiếp theo
- Đăng nhập một lần bằng setup project + `storageState`, không login lại ở mỗi test.
- Viết script seed dữ liệu (`npm run seed`) để không phải gõ lệnh `mmctl` bằng tay.
