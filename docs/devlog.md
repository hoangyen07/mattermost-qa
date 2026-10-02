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

---

## Ngày 3 — 29–30/09/2026: Test login sai, gửi message, luyện locator, thêm typecheck

### Mục tiêu
- Thêm test cho các trường hợp login sai.
- Viết test gửi message.
- Luyện chọn locator và dùng `playwright codegen`.

### Đã làm
- [x] Thêm các test login sai, sau đó refactor thành test data-driven
- [x] Đổi locator lỗi cố định trong `LoginPage` thành method `errorMessage(text)`
- [x] Thêm `tsconfig.json` và script `npm run typecheck`
- [x] Test gửi message: Page Object `ChannelPage` + `tests/web/message.spec.ts`
- [x] Review code và sửa 9 điểm (xem mục "Review code" bên dưới)
- [ ] Luyện `codegen`: chuyển sang ngày sau

### Test login sai: data-driven
Các trường hợp login sai có cùng các bước, chỉ khác dữ liệu. Vì vậy dùng một mảng và vòng lặp thay vì viết từng test riêng:

```ts
const invalidLogins = [
  { title: 'unknown username', username: 'no-such-user', password: 'whatever123', error: 'The email/username or password is invalid.' },
  { title: 'empty username',   username: '',             password: 'whatever123', error: 'Please enter your email or username' },
  { title: 'empty password',   username: 'someone',      password: '',            error: 'Please enter your password' },
  { title: 'wrong password',   username: env.adminUsername, password: 'wrong-password', error: 'The email/username or password is invalid.' },
];

for (const { title, username, password, error } of invalidLogins) {
  test(`shows an error with ${title}`, async ({ page }) => { /* ... */ });
}
```

- Thêm trường hợp mới chỉ cần thêm một dòng vào mảng.
- Tên test phải khác nhau, nên `title` được đưa vào tên test.
- `LoginPage` trước đó có 4 locator lỗi viết cứng (`errorMessage`, `errorMessageEmpty`…). Giờ chỉ còn một method nhận nội dung lỗi: `errorMessage(text)`.

**Nhận xét của QA:** username không tồn tại nhận **cùng thông báo** với sai mật khẩu. Đây là thiết kế đúng về bảo mật: nếu thông báo khác nhau, kẻ tấn công có thể dò xem username nào có thật. Test này vì vậy kiểm tra một yêu cầu bảo mật, không chỉ kiểm tra UI.

**Tránh khóa tài khoản:** Mattermost khóa user sau 10 lần đăng nhập sai liên tiếp. Chỉ có trường hợp `wrong password` dùng `qaadmin`. Các trường hợp khác dùng username không tồn tại hoặc để trống, nên không bị tính vào số lần sai.

### Test gửi message
`web/pages/ChannelPage.ts`:

| Thành phần | Locator / method | Lý do |
|---|---|---|
| Ô nhập tin nhắn | `getByTestId('post_textbox')` | Tên theo role (`Write to Town Square`) đổi theo từng channel, còn test id thì không |
| Nút gửi | `getByTestId('SendMessageButton')` | |
| Tin nhắn đã gửi | `postWithText(text)`: `getByTestId('post-message-text').filter({ hasText: text })` | Tìm theo nội dung, không dùng `.last()` |
| Mở channel | `goto(team, channel)` | Không dựa vào trang mà Mattermost tự chuyển đến sau khi login |

Hai nguyên tắc khi test gửi message:
1. **Nội dung tin nhắn phải khác nhau ở mỗi lần chạy:** `` `Hello from Playwright ${Date.now()}` ``. Nếu mọi lần đều gửi cùng một câu, test sẽ tìm thấy tin nhắn cũ của lần chạy trước và **pass dù lần gửi này bị lỗi**.
2. **Không dùng `.last()`:** khi chạy song song (`fullyParallel`), tin nhắn cuối cùng có thể là của test khác, làm test lúc pass lúc fail.

### Vấn đề gặp phải

**1. `toBeVisible can be only used with Locator object, was called with Promise`**
- *Hiện tượng:* cả 3 test login sai đều fail ở dòng `await expect(loginPage.errorMessage(error)).toBeVisible()`.
- *Nguyên nhân:* method được khai báo là `async errorMessage(text): Promise<Locator>`. Function có `async` **luôn trả về Promise**, nên `expect` nhận một Promise chứa Locator chứ không phải Locator. Chữ `await` ở đầu dòng chỉ chờ kết quả của `toBeVisible()`, không mở Promise bên trong `expect(...)`.
- *Cách sửa:* bỏ `async` và đổi kiểu trả về thành `Locator`. `getByText()` chỉ tạo ra một mô tả cách tìm phần tử và chạy xong ngay, không cần chờ gì.
- *Bài học:*

  | Loại method trong Page Object | Có `async` không |
  |---|---|
  | Trả về locator (`errorMessage(text)`) | ❌ Không |
  | Thao tác với trang (`goto()`, `login()`) | ✅ Có |

**2. Lỗi trên không được phát hiện trước khi chạy test**
- *Nguyên nhân:* repo chưa có `tsconfig.json`. Playwright tự dịch TypeScript khi chạy nhưng **không kiểm tra kiểu**.
- *Cách sửa:* thêm `tsconfig.json` và script `typecheck`. Khi thử lại với lỗi cũ, `tsc` báo ngay:
  ```
  error TS2339: Property 'toBeVisible' does not exist on type 'MakeMatchers<void, Promise<Locator>, {}>'.
  ```
  Playwright có khai báo kiểu cho `expect`: khi truyền vào một Promise thì không có `toBeVisible`. Nếu có tsconfig sớm hơn, VS Code đã gạch đỏ lỗi này ngay khi viết code.

**3. `Property 'page' does not exist on type 'ChannelPage'`**
- *Hiện tượng:* `npm run typecheck` báo lỗi ở `postWithText`, dòng `return this.page.getByTestId(...)`.
- *Nguyên nhân:* constructor viết `constructor(page: Page)`. Khi đó `page` chỉ là tham số bình thường, **chỉ dùng được bên trong constructor**. Class không có thuộc tính `this.page`, nên method bên ngoài constructor không dùng được.
- *Cách sửa:* viết `constructor(private readonly page: Page)`. Đây là **parameter property** của TypeScript: thêm `private` / `public` / `readonly` trước tham số thì TypeScript tự tạo thuộc tính cho class và gán giá trị vào, tương đương với `this.page = page`.
  - `private`: test không gọi thẳng `channelPage.page`, mà gọi method của Page Object.
  - `readonly`: mỗi Page Object gắn với đúng một `page`, không đổi.
- *Bài học:* `typecheck` bắt được lỗi này trước khi chạy test.

### Review code
Sau khi viết xong, review lại toàn bộ code. Các điểm tìm thấy và đã sửa, xếp theo mức độ quan trọng:

| # | Mức độ | Vấn đề | Cách sửa |
|---|---|---|---|
| 1 | 🔴 | Nội dung tin nhắn cố định, nên test có thể pass dù không gửi được | Thêm `Date.now()` vào nội dung |
| 2 | 🔴 | Tìm tin nhắn bằng `.last()`, dễ lấy nhầm tin nhắn của test khác khi chạy song song | `postWithText(text)` lọc theo nội dung |
| 3 | 🟠 | Locator ô nhập chứa tên channel (`Write to Town Square`) | Dùng `getByTestId('post_textbox')` |
| 4 | 🟠 | `ChannelPage` không có `goto()`, test dựa vào trang tự chuyển đến sau login | Thêm `goto(team, channel)` |
| 5 | 🟠 | `.env.example` chứa tài khoản chỉ có trên máy cá nhân, không khớp hướng dẫn seed | Đổi thành `qaadmin` / `qa-team` |
| 6 | 🟡 | Đặt tên không thống nhất (`textboxPostMessage` và `usernameInput`) | Thống nhất theo dạng phần tử + loại: `messageInput`, `sendButton`, `sendMessage()` |
| 7 | 🟡 | Trong `LoginPage`, method nằm trước constructor | Theo thứ tự thuộc tính → constructor → method |
| 8 | 🟡 | Chỗ `import`, chỗ `import type` | Dùng `import type` cho `Locator`, `Page` |
| 9 | 🟡 | Comment còn sót, thiếu `;`, `package.json` có trường thừa | Dọn dẹp, thêm `"private": true` |

Hai lỗi 🔴 nguy hiểm nhất vì chúng làm test **cho kết quả sai**. Các lỗi còn lại chỉ ảnh hưởng đến khả năng dùng lại và độ dễ đọc của code.

### `tsconfig.json`: các option chính

| Option | Tác dụng |
|---|---|
| `strict: true` | Bật toàn bộ kiểm tra nghiêm ngặt. Nên bật từ đầu, vì bật sau khi code đã nhiều thì phải sửa rất nhiều |
| `noEmit: true` | Chỉ kiểm tra, không sinh file `.js`. Playwright tự chạy file `.ts` |
| `module: preserve` + `moduleResolution: bundler` | Để công cụ khác (Playwright) xử lý `import`, nên không cần thêm đuôi `.js` vào câu import |
| `forceConsistentCasingInFileNames` | Báo lỗi khi câu import khác chữ hoa/thường với tên file. Bắt được lỗi `loginPage.ts` / `LoginPage` của Ngày 2 ngay trên Mac |
| `noUnusedLocals` | Báo lỗi khi có biến hoặc import không dùng |
| `types: ["node"]` | Nạp khai báo kiểu của Node (`process.env`…) |

**Script `"typecheck": "tsc --noEmit"`:**
- Chạy bằng `npm run typecheck`. npm tự dùng `tsc` trong `node_modules/.bin`, tức là đúng phiên bản TypeScript của project.
- Khác với chạy test:

  | | `npm run typecheck` | `npx playwright test` |
  |---|---|---|
  | Kiểm tra gì | Code dùng đúng kiểu không | App chạy đúng không |
  | Phạm vi | Toàn bộ code | Chỉ đoạn code thực sự được chạy tới |
  | Cần Mattermost chạy không | Không | Có |

- Thói quen: chạy `typecheck` trước khi commit. Sau này trên CI, bước typecheck sẽ chạy trước bước test.

### Luyện locator
Thứ tự ưu tiên chọn locator, theo khuyến nghị của Playwright:

| Ưu tiên | Locator | Khi nào dùng |
|---|---|---|
| 1 | `getByRole` | Hầu hết mọi trường hợp |
| 2 | `getByLabel`, `getByPlaceholder` | Ô nhập có nhãn hoặc placeholder |
| 3 | `getByText` | Text không có role rõ ràng, như thông báo lỗi |
| 4 | `getByTestId` | Khi text thay đổi theo ngữ cảnh. Mattermost có sẵn `data-testid` ở nhiều chỗ |
| 5 | CSS / XPath | Cách cuối cùng, dễ vỡ nhất |

Ví dụ khi test id tốt hơn role: ô nhập tin nhắn có tên `Write to Town Square`. Sang channel khác thì tên đổi, ví dụ thành `Write to Off-Topic`. Vì vậy Page Object dùng chung cho mọi channel nên dùng `getByTestId('post_textbox')`.

**Strict mode:** locator khớp nhiều hơn một phần tử thì `click` và `fill` sẽ báo lỗi `strict mode violation`. Thu hẹp bằng `.filter({ hasText })`, hoặc dùng `.first()` / `.last()` khi thật sự cần.

### Kiểm tra kết quả
```
$ npm run typecheck
> tsc --noEmit                      # no errors

$ npx playwright test
Running 6 tests using 6 workers
  ✓  4 [web] › login.spec.ts › Login › shows an error with empty username (3.4s)
  ✓  6 [web] › login.spec.ts › Login › shows an error with empty password (3.5s)
  ✓  5 [web] › login.spec.ts › Login › shows an error with unknown username (3.9s)
  ✓  1 [web] › login.spec.ts › Login › shows an error with wrong password (4.7s)
  ✓  3 [web] › login.spec.ts › Login › logs in with valid credentials (4.8s)
  ✓  2 [web] › message.spec.ts › Send Message › sends a message in a channel (6.9s)
  6 passed (7.6s)
```
Chạy riêng `message.spec.ts` thêm một lần nữa vẫn pass, nghĩa là nội dung tin nhắn không bị trùng giữa các lần chạy.

### Tiếp theo
- Luyện `codegen`, dùng `--save-storage` / `--load-storage` để không phải login lại.
- Đăng nhập một lần bằng `storageState`. Hiện `message.spec.ts` phải login qua UI trước khi gửi tin nhắn: tốn thời gian, và nếu trang login lỗi thì mọi test cần đăng nhập đều fail theo.

---

## Ngày 4 — 30/09–01/10/2026: Refactor Page Object: fixture, component, quy tắc

### Mục tiêu
`LoginPage` và `ChannelPage` đã có từ Ngày 2–3. Ngày 4 nâng Page Object lên mức các framework thực tế hay dùng:
- Bỏ đoạn `new ...Page(page)` lặp lại trong mọi test.
- Tách phần giao diện dùng chung (sidebar) thành component riêng.
- Đặt ra quy tắc rõ ràng cho Page Object.

### Đã làm
- [x] Đưa Page Object vào fixture: `src/fixtures/index.ts`
- [x] Tách component `web/components/Sidebar.ts`, gắn vào `ChannelPage`
- [x] Thêm test chuyển channel bằng sidebar rồi gửi tin nhắn
- [x] Đối chiếu code với checklist quy tắc Page Object
- [ ] Luyện `codegen`: chuyển sang ngày sau

Cấu trúc sau Ngày 4:
```
src/fixtures/index.ts       – test + expect, provides page objects as fixtures
web/pages/LoginPage.ts
web/pages/ChannelPage.ts    – has a Sidebar
web/components/Sidebar.ts   – channel sidebar component
tests/web/login.spec.ts
tests/web/message.spec.ts
```

### 1. Đưa Page Object vào fixture
**Vấn đề:** test nào cũng phải `import` rồi `new LoginPage(page)`, `new ChannelPage(page)`. Khi có 30 file test, nếu constructor đổi tham số thì phải sửa cả 30 file.

**Fixture là gì:** `{ page }` trong `async ({ page }) => ...` chính là một fixture có sẵn. Playwright tạo nó trước mỗi test và dọn dẹp sau test. Có thể tự định nghĩa fixture theo cùng cách:

```ts
export const test = base.extend<Pages>({
    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },
    channelPage: async ({ page }, use) => {
        await use(new ChannelPage(page));
    },
});
export { expect } from '@playwright/test';
```

- `use(...)` giao Page Object cho test. Code **trước** `use` là setup, code **sau** `use` là teardown (sau này dùng để xóa dữ liệu test).
- **Fixture chỉ được tạo khi test cần đến.** Test chỉ khai báo `loginPage` thì `channelPage` không được tạo.
- Test import `test`, `expect` từ `src/fixtures` thay vì `@playwright/test`, rồi nhận Page Object qua tham số:
  ```ts
  test('sends a message in a channel', async ({ page, loginPage, channelPage }) => { ... });
  ```

### 2. Tách component: Sidebar
Sidebar xuất hiện ở nhiều màn hình. Nếu đưa hết vào `ChannelPage` thì class này ngày càng to, nên tách thành **component object** rồi gắn vào Page Object: `channelPage.sidebar.openChannel('Off-Topic')`.

```ts
export class Sidebar {
    readonly root: Locator;

    constructor(page: Page) {
        this.root = page.getByRole('application', { name: 'channel sidebar region' });
    }

    channelLink(name: string): Locator {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.root.getByRole('link', { name: new RegExp(`^${escaped} (public|private) channel$`, 'i') });
    }

    async openChannel(name: string) {
        await this.channelLink(name).click();
    }
}
```

- **Tìm bên trong một vùng (scoping):** `this.root.getByRole(...)` chỉ tìm trong sidebar. Nếu dùng `page.getByRole(...)` thì sẽ tìm trên cả trang, và có thể trùng với link cùng tên ở chỗ khác, ví dụ trong nội dung tin nhắn.
- **Tên link thật** (xem bằng `ariaSnapshot`): `off-topic public channel`, `town square public channel`. Đó là tên channel viết thường, nối thêm loại channel.
- **Vì sao dùng regex khớp chính xác:** `getByRole` mặc định so khớp **không phân biệt hoa thường** và chỉ cần tên **chứa** chuỗi tìm kiếm. Nếu dùng `name: 'Town'`, nó sẽ khớp cả `town square public channel`. Regex `^...$` chỉ khớp đúng tên channel.
- **Vì sao escape:** tên channel có thể chứa ký tự đặc biệt của regex, ví dụ `C++`.
- `Sidebar` **không** dùng `private readonly page`: nó chỉ cần `page` để tạo `root`, các method khác đều tìm từ `root`. Ngược lại, `ChannelPage` cần `this.page` trong `goto()` và `postWithText()`.

**Test mới:** `sends a message after switching channel from the sidebar`. Test mở `town-square`, chuyển sang Off-Topic bằng sidebar, kiểm tra URL có `/off-topic`, rồi gửi tin nhắn và kiểm tra tin nhắn hiển thị. Test pass cũng chứng minh `ChannelPage` dùng được cho mọi channel, nhờ việc đổi locator ô nhập sang test id ở Ngày 3.

### 3. Quy tắc Page Object

**Assertion để ở đâu?**

| Cách | Ví dụ | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **`expect` nằm trong test** (chọn cách này) | `await expect(channelPage.postWithText(msg)).toBeVisible()` | Đọc test là thấy ngay nó kiểm tra gì | Test dài hơn một chút |
| `expect` nằm trong Page Object | `await channelPage.expectMessageVisible(msg)` | Test ngắn | Phải mở Page Object mới biết test kiểm tra gì; Page Object phình to dần |

Page Object chỉ làm 2 việc: **cung cấp locator** và **thực hiện hành động**. "Cái gì là đúng" do test quyết định.

**Khi nào dùng sidebar, khi nào dùng `goto()`?**
Phụ thuộc vào việc test **muốn kiểm tra điều gì**:

| Test | Mục đích | Nên dùng |
|---|---|---|
| `sends a message in a channel` | Kiểm tra gửi tin nhắn | `goto()`: chỉ cần đến được channel, đi bằng cách nào không quan trọng |
| `sends a message after switching channel from the sidebar` | Kiểm tra chuyển channel bằng sidebar | `sidebar.openChannel()`: thao tác chuyển channel chính là thứ đang được test |

Nếu mọi test đều đi qua sidebar, thì khi sidebar lỗi, **tất cả** test cần mở channel đều fail, kể cả test gửi tin nhắn hay upload file. Báo cáo có hàng loạt test đỏ, và phải mất công tìm xem lỗi thật sự ở đâu. Nguyên tắc: **mỗi test chỉ nên fail vì đúng chức năng mà nó kiểm tra.** Các bước chuẩn bị nên đi đường ngắn và ổn định nhất (`goto()`, API), chỉ phần đang được kiểm tra mới đi qua UI.

Lý do khác để dùng `goto()`:
- Nhanh hơn.
- Không bị ảnh hưởng khi channel không hiện trên sidebar (chưa tham gia, nhóm channel bị thu gọn, phải cuộn mới thấy).
- Mở được đường dẫn có trạng thái riêng, như link tới một tin nhắn cụ thể (`/team/pl/<post-id>`).

**Những thứ chưa làm, và lý do:**
- **`BasePage`** (class cha cho mọi Page Object): hiện mới có 2 Page Object và chúng gần như không có code chung. Tạo lúc này là thêm một tầng mà chưa giải quyết vấn đề nào. Chỉ tạo khi thật sự có code lặp ở 3–4 Page Object (YAGNI: *You Aren't Gonna Need It*).
- **Fixture đăng nhập sẵn:** là việc của `storageState`, sẽ làm thành bài riêng.

**Checklist** (đã đối chiếu với code hiện tại):
- [x] Test không `new` Page Object, mà nhận qua fixture
- [x] Page Object không chứa `expect`
- [x] Method trả về locator thì không có `async`, method thao tác với trang thì có
- [x] Locator của component được tìm bên trong `root` của component đó
- [x] Đặt tên theo một kiểu: `xxxInput`, `xxxButton`, `xxxLink`, method là động từ
- [x] Page Object không viết cứng dữ liệu test (team, channel, nội dung), mà nhận từ test

### Kiểm tra kết quả
```
$ npm run typecheck
> tsc --noEmit                      # no errors

$ npx playwright test
Running 7 tests using 6 workers
  ✓  1 [web] › login.spec.ts › Login › shows an error with empty password (3.6s)
  ✓  3 [web] › login.spec.ts › Login › shows an error with unknown username (3.6s)
  ✓  4 [web] › login.spec.ts › Login › shows an error with empty username (3.7s)
  ✓  6 [web] › login.spec.ts › Login › shows an error with wrong password (4.5s)
  ✓  2 [web] › login.spec.ts › Login › logs in with valid credentials (4.6s)
  ✓  5 [web] › message.spec.ts › Send Message › sends a message in a channel (6.1s)
  ✓  7 [web] › message.spec.ts › Send Message › sends a message after switching channel from the sidebar (5.3s)
  7 passed (9.6s)
```

### Tiếp theo
- Đăng nhập một lần bằng setup project + `storageState`. Hiện 2 test gửi tin nhắn đều phải login qua UI trước.
- Luyện `codegen`, dùng `--save-storage` / `--load-storage` để không phải login lại.

---

## Ngày 5 — 02/10/2026: Đưa cấu hình ra `.env`, kiểm tra repo như người mới clone

### Mục tiêu
Phần lớn cấu hình của test đã nằm trong `.env` từ Ngày 2, và repo đã được đẩy lên GitHub. Ngày 5 tập trung vào:
- Tìm và đưa nốt phần cấu hình còn viết cứng ra `.env`.
- Kiểm tra mục đích thật của việc này: **người khác clone repo về có chạy được không?**

### Đã làm
- [x] Tìm cấu hình còn viết cứng: chỉ còn trong `docker/docker-compose.yml`
- [x] `docker-compose.yml` đọc thông tin đăng nhập DB và port từ `.env`, có giá trị mặc định
- [x] Thêm script `env:up`, `env:down`, `env:reset`
- [x] Kiểm tra lịch sử git: `.env` chưa từng bị commit
- [x] Dựng repo từ đầu như người mới clone, theo đúng các bước trong README. **Tìm ra 1 bug**, đã sửa
- [x] Cập nhật README (cả EN và VI): trạng thái các tầng test, hướng dẫn chạy local theo các bước đã chạy thật
- [ ] Thêm About, Topics, Pin repo trên GitHub

### 1. Cấu hình hay dữ liệu test?
Không phải chuỗi nào viết cứng trong code cũng cần đưa ra `.env`:

| Loại | Định nghĩa | Ví dụ | Để ở đâu |
|---|---|---|---|
| **Cấu hình** | Thay đổi theo môi trường chạy (máy cá nhân, CI, máy người khác) | URL, port, tài khoản, mật khẩu | `.env` |
| **Dữ liệu test** | Thuộc về nội dung test | `town-square`, `Off-Topic`, thông báo lỗi cần kiểm tra | Trong test |

Phần test đã sạch. Chỗ còn viết cứng là `docker-compose.yml`, và mật khẩu DB bị lặp ở 2 nơi (`POSTGRES_PASSWORD` và chuỗi kết nối `MM_SQLSETTINGS_DATASOURCE`). Nếu chỉ sửa một nơi, app sẽ không kết nối được DB.

### 2. Biến môi trường trong Docker Compose
```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mmuser_password}
MM_SQLSETTINGS_DATASOURCE: postgres://${POSTGRES_USER:-mmuser}:${POSTGRES_PASSWORD:-mmuser_password}@db:5432/${POSTGRES_DB:-mattermost}?...
ports:
  - "${MM_PORT:-8065}:8065"
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
```

- **`${VAR:-default}`**: nếu biến không có hoặc rỗng thì dùng giá trị mặc định. Ai không có `.env` vẫn chạy được như cũ.
- **`$$`**: Compose sẽ hiểu `${...}` là biến của nó và thay giá trị ngay khi đọc file. Viết `$$` để Compose để nguyên `${POSTGRES_USER}`, và lệnh healthcheck sẽ đọc biến này **bên trong container**.
- **Compose không tự đọc `.env` ở thư mục gốc repo.** Khi chạy `-f docker/docker-compose.yml`, Compose tìm `.env` trong thư mục chứa file compose (`docker/`). Vì vậy script phải chỉ rõ `--env-file .env`.
- **Kiểm tra mà không cần bật container:** `docker compose -f docker/docker-compose.yml --env-file .env config` in ra file compose sau khi đã thay biến. Đã kiểm tra cả trường hợp có và không có `.env`.
- **Bẫy:** Postgres **chỉ đọc `POSTGRES_PASSWORD` một lần, lúc tạo database mới**. Đổi mật khẩu trong `.env` khi volume đã tồn tại thì DB vẫn giữ mật khẩu cũ, còn app dùng mật khẩu mới, nên không kết nối được. Vì vậy giữ nguyên giá trị cũ làm mặc định, và ghi cảnh báo vào `.env.example`.

**Script mới:**

| Script | Tác dụng |
|---|---|
| `npm run env:up` | `up -d --wait`: bật và chờ đến khi `healthy` |
| `npm run env:down` | Tắt, giữ dữ liệu |
| `npm run env:reset` | `down -v`: tắt và **xóa toàn bộ dữ liệu**. Tên script nói rõ điều đó để không ai chạy nhầm |

### 3. Kiểm tra lịch sử git
- `.env` chưa từng xuất hiện trong lịch sử: kiểm tra bằng `git log --all -- .env`.
- Nhưng ở commit `58fd7ca` (Ngày 2), `.env.example` từng chứa tài khoản cá nhân kèm mật khẩu, và commit đó đã được đẩy lên GitHub.
- **Xóa khỏi file không có nghĩa là xóa khỏi lịch sử.** Ai cũng xem được commit cũ. Đây chỉ là tài khoản trên Mattermost local, nên cách xử lý là đổi mật khẩu nếu nó được dùng lại ở nơi khác. Với secret thật như API key hay token, phải viết lại lịch sử bằng `git filter-repo` và **thu hồi** secret đó.
- Quy tắc từ giờ: `.env.example` chỉ chứa giá trị mẫu, và luôn xem `git diff --cached` trước khi commit.

### 4. Dựng repo từ đầu như người mới clone
Copy đúng những file sẽ được push sang một thư mục tạm. Dùng `COMPOSE_PROJECT_NAME=mmfresh` để có DB trống, không đụng đến môi trường đang dùng. Sau đó làm theo từng bước trong README:
```bash
npm ci
cp .env.example .env
npx playwright install chromium
npm run env:up
# create qaadmin + qa-team with mmctl
npm run test:web
```

`npm ci` khác `npm install`: nó cài **đúng phiên bản** ghi trong `package-lock.json` và không sửa file lock. Đây là lệnh nên dùng trên CI và khi clone repo mới.

#### Bug: 2 test gửi tin nhắn fail trên môi trường mới
- *Hiện tượng:* 5 pass, 2 fail. Cả 2 test gửi tin nhắn bị timeout ở bước click nút gửi. Trên máy cá nhân, cùng code đó vẫn pass.
- *Điều tra:* ảnh chụp lúc lỗi cho thấy bảng **"Welcome to Mattermost"** nằm đè lên trang. Phần call log trong `error-context.md` ghi rõ:
  ```
  - element is visible, enabled and stable
  - <div data-cy="onboarding-task-list-overlay"></div> ... intercepts pointer events
  47 × retrying click action
  ```
  Nút gửi vẫn hiển thị và bấm được, nhưng một lớp phủ trong suốt nằm trên nó và nhận hết các cú click.
- *Nguyên nhân:* `qaadmin` là **system admin vừa được tạo**. Lần đầu đăng nhập, Mattermost hiện onboarding task list. Tài khoản cá nhân trên máy dev đã tắt bảng này từ trước, nên bug không bao giờ xuất hiện ở đó.
- *Cách sửa:* thêm vào `docker-compose.yml`:
  ```yaml
  # New admins get an onboarding overlay that blocks every click; keep the test env deterministic
  MM_SERVICESETTINGS_ENABLEONBOARDINGFLOW: "false"
  ```
- *Xác nhận:* chạy `env:reset` để xóa sạch dữ liệu của bản thử, tạo lại user và team, rồi chạy lại: **7/7 pass**. Bước này để chắc test pass là nhờ config, không phải nhờ trạng thái còn sót từ lần chạy trước.
- *Bài học:*
  - **"Chạy được trên máy mình" chưa đủ.** Test pass trên máy dev một phần là nhờ trạng thái có sẵn của tài khoản cá nhân, thứ mà người khác và CI không có.
  - Môi trường test phải cho **cùng một kết quả ở mọi lần chạy**. Các popup chỉ hiện lần đầu (onboarding, tour, thông báo tính năng mới) cần được tắt trong cấu hình môi trường test. Nếu muốn kiểm tra chính onboarding thì viết test riêng.
  - Khi click bị timeout, hãy đọc **call log** trong `error-context.md`. Dòng `intercepts pointer events` chỉ đúng phần tử đang chặn.

#### Phát hiện thêm: bản clone dùng chung container với bản chính
Tên Compose project mặc định lấy theo **tên thư mục chứa file compose**. Ở cả bản chính và bản clone, thư mục đó đều tên là `docker`. Thêm vào đó, `container_name: mm-db` / `mm-app` bị đặt cứng. Kết quả là 2 bản sẽ dùng chung container và volume, hoặc báo lỗi trùng tên. Lần này tách ra bằng `COMPOSE_PROJECT_NAME`. Cách lâu dài là khai báo `name:` ở đầu file compose, nhưng việc đó sẽ đổi tên volume, tức là DB hiện tại bắt đầu lại từ đầu. Để quyết định sau.

### Kiểm tra kết quả
```
$ docker compose -f docker/docker-compose.yml --env-file .env config   # variables resolved correctly
$ npm run env:up
 Container mm-db Healthy
 Container mm-app Healthy
$ npm run typecheck                                                    # no errors
$ npx playwright test
  7 passed (9.5s)
```
Trên môi trường mới clone, với DB trống: 7/7 pass sau khi tắt onboarding.

### Ghi chú cho các ngày sau
- Commit `8fcb90f` (`read database credentials and port from .env`) chứa luôn dòng tắt onboarding. Commit đã được push nên không sửa lại message. Từ giờ, mỗi thay đổi có ý nghĩa riêng nên tách thành commit riêng (`git add -p`).
- Đổi `MM_PORT` thì phải đổi cả `BASE_URL` cho khớp.

### Tiếp theo
- Script `npm run seed` thay cho 3 lệnh `mmctl` thủ công trong README.
- Đăng nhập một lần bằng setup project + `storageState`.
- Quyết định có thêm `name:` vào file compose hay không.
