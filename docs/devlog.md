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

---

## Ngày 6 — 03/10/2026: Gọi API Mattermost bằng Postman: login, token, tạo post

### Mục tiêu
Khám phá REST API của Mattermost trước khi viết test API bằng code: đăng nhập lấy token, lấy ID channel, tạo post, và thử các trường hợp lỗi.

### Đã làm
- [x] Postman collection `postman/mattermost.postman_collection.json`: 5 request luồng chính + 3 request lỗi, 16 assertion
- [x] Postman environment `postman/local.postman_environment.json`: giá trị mẫu, **không chứa mật khẩu hay token**
- [x] Script `npm run test:postman` chạy collection bằng Newman, lấy tài khoản từ `.env`

### ▶️ Cách chạy (dùng tạm cho đến khi có test API bằng Playwright)
```bash
npm run env:up          # Docker Desktop must be running
npm run test:postman
```
- Tài khoản lấy từ `.env` (`MM_ADMIN_USERNAME`, `MM_ADMIN_PASSWORD`, `MM_TEAM`, `BASE_URL`), nên không cần gõ mật khẩu.
- Lần đầu chạy, `npx` sẽ tải Newman (cần mạng), các lần sau dùng lại bản đã tải.
- Mỗi lần chạy tạo thêm 1 tin nhắn test trong `town-square`.
- Kết quả đúng: `requests 8 / failed 0`, `assertions 16 / failed 0`. Có assertion fail thì lệnh trả về exit code `1`.

Dùng trong ứng dụng Postman: import 2 file trong `postman/`, chọn environment `Local`, điền `username` / `password` / `teamName` ở cột **Current value** (cột này chỉ lưu trên máy, không bị đưa vào file khi export), rồi chọn **Run collection**.

### Collection

| Folder | Request | Kiểm tra |
|---|---|---|
| Happy path | `POST /users/login` | `200`, có header `Token`. Lưu `token`, `userId` |
| | `GET /users/me` | `200`, đúng user vừa đăng nhập |
| | `GET /teams/name/{team}/channels/name/{channel}` | `200`, đúng channel. Lưu `channelId` |
| | `POST /posts` | **`201`**, đúng `message`, `channel_id`, `user_id`. Lưu `postId` |
| | `GET /posts/{postId}` | `200`, đọc lại post vừa tạo |
| Errors | Login sai thông tin | `401` + `id` lỗi |
| | `GET /users/me` không có token | `401` + `id` lỗi |
| | `POST /posts` thiếu `channel_id` | `403` + `id` lỗi |

- **Auth đặt ở cấp collection** (Bearer `{{token}}`), các request kế thừa. Request login và request "không có token" đặt No Auth.
- **Environment** giống ý tưởng `.env` ở Ngày 5: request không viết cứng URL hay tài khoản.
- **Pre-request script** tạo nội dung `Hello from Postman ${Date.now()}`. Nội dung khác nhau mỗi lần chạy, cùng nguyên tắc với test UI ở Ngày 3.
- Tên request, tên test và comment trong collection viết bằng tiếng Anh.

### Những điều học được về API Mattermost
1. **Token nằm trong header `Token`, không nằm trong body.** Body của response login chỉ là thông tin user (`id`, `username`, `roles`…).
2. **API dùng ID, không dùng tên.** Giao diện hiện `town-square`, nhưng API tạo post cần `channel_id`. Vì vậy phải gọi API lấy channel theo tên trước.
3. **Tạo mới trả về `201 Created`, không phải `200`.** Test nên kiểm tra đúng mã này.
4. **Kiểm tra `id` của lỗi, không kiểm tra `message`.** API login trả về câu `Enter a valid email or username and/or password.`, còn giao diện lại hiện `The email/username or password is invalid.`. Giao diện tự dịch mã lỗi thành câu riêng, nên `id` mới là thứ ổn định.
5. **Phát hiện: tạo post thiếu `channel_id` trả về `403`, không phải `400`.**
   - Kết quả: `403 Forbidden`, `api.context.permissions.app_error`, "You do not have the appropriate permissions."
   - Request thiếu dữ liệu bắt buộc lẽ ra nên trả về `400 Bad Request`. Có vẻ server kiểm tra quyền trên một channel rỗng **trước khi** kiểm tra body có hợp lệ không.
   - Có thể là bug hoặc thiết kế có chủ ý, nhưng thông báo lỗi chắc chắn gây hiểu nhầm cho người gọi API. Test trong collection kiểm tra **hành vi hiện tại** và có comment ghi rõ điều này.

### Kiểm tra qua nhiều tầng (làm bằng tay)
Một tin nhắn tạo qua API:
1. **API:** `201`, có `postId`.
2. **UI:** mở `town-square` trên trình duyệt, thấy tin nhắn.
3. **DB:** `SELECT message, channelid FROM posts WHERE id = '<postId>';`

Đây chính là ví dụ "cross-layer" trong README, làm bằng tay trước khi tự động hóa.

### Quyết định: Newman chạy qua `npx`, không thêm vào `devDependencies`
- **Vấn đề:** cài `newman` 6.2.2 (bản mới nhất) làm `npm audit` báo **19 lỗ hổng** (1 critical, 11 high, 7 moderate). Tất cả nằm trong các thư viện mà Newman phụ thuộc vào (`node-forge`, `lodash`, `handlebars`…). "Bản sửa" mà `npm audit fix --force` đề xuất lại là hạ xuống Newman 4.6.1, một bản cũ hơn nhiều.
- **Các lựa chọn đã cân nhắc:**

  | Lựa chọn | Ưu điểm | Nhược điểm |
  |---|---|---|
  | Giữ trong `devDependencies` | Phiên bản cố định trong lock file, không cần mạng | Repo hiện cảnh báo Dependabot trên GitHub |
  | **Chạy qua `npx` (đã chọn)** | Repo không có lỗ hổng trong `npm audit`. Phiên bản vẫn được ghim (`newman@6.2.2`) | Lần đầu chạy cần mạng để tải. Code chạy vẫn là cùng một Newman, nên rủi ro không giảm, chỉ là không nằm trong dependency của project |

- **Vì sao chấp nhận được:** Newman chỉ chạy trên máy cá nhân, gọi tới server local. Nó là công cụ tạm, sẽ được thay bằng test API viết bằng Playwright `request`.
- **Cách làm:** `scripts/run-postman.mts` đọc `.env`, rồi gọi `npx --yes newman@6.2.2 run ...` bằng `spawnSync`, và trả lại exit code của Newman cho npm script.
- **Script viết bằng `.mts`:** Node 24 chạy được TypeScript trực tiếp. Đuôi `.mts` báo cho Node biết đây là ES module, vì `package.json` đang là `"type": "commonjs"`. Dùng file thay vì viết lệnh shell trong `package.json`, vì `source .env` cần nhiều dấu escape và không chạy được trên Windows.
- **Đã kiểm tra:** `npm audit` → `found 0 vulnerabilities`. Cố ý sai mật khẩu → exit code `1`. Chạy bình thường → exit code `0`.

### Kiểm tra kết quả
```
$ npm run typecheck          # no errors
$ npm audit                  # found 0 vulnerabilities
$ npm run test:postman
│                requests │                 8 │                 0 │
│              assertions │                16 │                 0 │
```

### Tiếp theo
- Viết test API bằng Playwright `request`, theo đúng các bước của collection này:

  | Postman | Playwright |
  |---|---|
  | Environment | `.env` + `env.ts` |
  | Auth ở cấp collection | `extraHTTPHeaders`, trong config hoặc trong fixture |
  | Pre-request script | Code chạy trước request trong test |
  | `pm.test` + `pm.expect` | `expect(response.status()).toBe(201)` |

- Khi đã có test API bằng Playwright: xóa `postman/`, `scripts/run-postman.mts` và script `test:postman`.

---

## Ngày 7 — 04/10/2026: Bắt đầu test API bằng Playwright: API client, fixture, kiến thức TypeScript

### Mục tiêu
Chuyển collection Postman (Ngày 6) sang test API bằng Playwright `request`: viết API client, fixture `api`, test login.

### Đã làm
- [x] Project `api` trong `playwright.config.ts`, script `npm run test:api`
- [x] `MattermostApi` lưu token và gửi `Authorization: Bearer`
- [x] Fixture `api` theo scope worker, báo lỗi rõ khi login thất bại
- [x] `tests/api/auth.spec.ts`: 4 test, chuyển từ collection Postman

| Test | Client | Kiểm tra | Request Postman tương ứng |
|---|---|---|---|
| `logs in with valid credentials` | `request` mới | `200`, có header `token`, đúng `username` | Happy path → Login |
| `rejects invalid credentials` | `request` mới | `401` + `id` lỗi | Errors → Login with invalid credentials |
| `rejects a request without a token` | `request` mới | `401` + `id` lỗi | Errors → Get current user without token |
| `returns the logged-in user` | fixture `api` | `200`, đúng `username` | Happy path → Get current user |

- Test login và test "không có token" dùng `request` có sẵn của Playwright: context mới cho mỗi test, chưa có cookie hay token. Fixture `api` (đã login) chỉ dùng khi việc đăng nhập **không phải** thứ đang được test.
- Case login sai dùng `no-such-user`, không dùng tài khoản admin: Mattermost khóa tài khoản sau nhiều lần login sai, admin bị khóa thì cả bộ test sập.
- README: lớp API chuyển sang 🟡, thêm `npm run test:api` vào hướng dẫn chạy.

### Vấn đề gặp phải
**`tsc` báo 3 lỗi trong `auth.spec.ts`:** 2 lỗi `TS2307: Cannot find module` và 1 lỗi `TS7031: Binding element 'api' implicitly has an 'any' type`.
- **Nguyên nhân:** file bị tạo ở `tests/api/tests/api/auth.spec.ts`, lồng thừa 2 cấp thư mục. Có lẽ do terminal đang đứng sẵn trong `tests/api` mà vẫn gõ đường dẫn `tests/api/...`.
- Import `'../../src/fixtures'` viết đúng cho file ở `tests/api/`. Từ `tests/api/tests/api/`, `../..` chỉ lên tới `tests/api/`, nên trỏ vào `tests/api/src/fixtures`, thư mục không tồn tại.
- Lỗi `TS7031` là **lỗi kéo theo**: không đọc được fixtures thì TypeScript không biết `api` là `MattermostApi`, nên coi là `any`, mà `strict: true` cấm `any` ngầm.
- **Cách sửa:** chuyển file về `tests/api/auth.spec.ts`.
- **Bài học:** nhiều lỗi cùng lúc thì sửa lỗi đầu tiên trước, các lỗi sau thường là hệ quả. Chạy `pwd` trước khi tạo file.

### 1. `MattermostApi`: các điểm TypeScript cần hiểu

#### a. Vì sao `authHeaders()` trả về `Record<string, string>`
`Record<K, V>` là kiểu có sẵn của TypeScript: **object có key kiểu `K`, value kiểu `V`**. `Record<string, string>` tương đương `{ [key: string]: string }`, đúng hình dạng của HTTP header.

```ts
{ Authorization: 'Bearer abc123' }   // has a token
{}                                   // no token yet → still a valid Record<string, string>
```

Không dùng `{ Authorization: string }` vì:
- Lúc chưa login, hàm trả về `{}`. Kiểu `{ Authorization: string }` bắt buộc phải có key đó nên sẽ báo lỗi.
- Sau này cần thêm header khác thì không phải sửa kiểu.
- Option `headers` của Playwright cũng dùng kiểu `{ [key: string]: string }`.

#### b. `data: { login_id: username, password }`: cú pháp rút gọn
Khi **tên key trùng tên biến**, chỉ cần viết một lần (shorthand property):
```ts
{ password }            // same as { password: password }
```
- `login_id` không rút gọn được vì key (`login_id`) và biến (`username`) khác tên.
- Không đặt tên biến là `login_id`: code TypeScript dùng camelCase, tên kiểu snake_case chỉ nên xuất hiện ở chỗ giao tiếp với API.

#### c. `login()` lưu token để dùng cho các lần gọi sau
Hàm làm 2 việc tách biệt:
```ts
if (response.ok()) this.token = response.headers()['token'];  // 1. side effect: store token on the object
return response;                                               // 2. hand the response back to the caller
```
1. **Lưu token:** `this.token` là thuộc tính của object, tồn tại cùng object. Các method gọi sau đọc token qua `authHeaders()`. Chỉ lưu khi login thành công.
2. **`return response`:** không liên quan đến việc lưu token, chỉ trả response về để test kiểm tra.

**Token gắn với từng object, không dùng chung giữa các object:**
```ts
const a = new MattermostApi(request);
await a.login(user, pass);    // a.token = 'abc...'
const b = new MattermostApi(request);
await b.getMe();              // b.token is undefined → 401
```
- Fixture `api` tạo 1 object cho mỗi worker, nên các test trong cùng worker dùng chung token.
- Test tự gọi `new MattermostApi(request)` thì được object mới, chưa có token.

### 2. Fixture: đặt tên type theo scope
`api` vẫn là tên fixture dùng trong test. `WorkerFixtures` là tên của **type chứa** fixture `api`.

`base.extend` nhận 2 tham số kiểu, **vị trí có ý nghĩa**:
```ts
base.extend<TestFixtures, WorkerFixtures>({ ... })
//          ↑ 1st: test-scoped   ↑ 2nd: worker-scoped
```

| Scope | Tạo khi nào | Hủy khi nào | Fixture |
|---|---|---|---|
| test | trước mỗi test | sau mỗi test | `loginPage`, `channelPage` |
| worker | lần đầu một test trong worker cần đến | khi worker kết thúc | `api` |

- Tên cũ `Pages` mô tả **nội dung**. Thêm `api` vào thì tên không còn đúng, vì `api` không phải page.
- Playwright chia fixture theo **vòng đời**, nên đặt tên theo scope cho biết type nào đặt ở vị trí nào trong `extend<…, …>`.
- Page object phải là test fixture vì cần `page` (scope test). **Fixture worker không được phụ thuộc fixture test**, vì nó sống lâu hơn. `api` chỉ cần `playwright` (scope worker) nên đặt ở scope worker được.

### 3. `Record`: các chỗ hay dùng khác
`Record<string, string>` dùng cho mọi object mà key và value đều là chuỗi.

| Chỗ dùng | Ví dụ |
|---|---|
| Header của response | `response.headers()` trả về `{ [key: string]: string }` |
| Biến môi trường | `process.env` là `Record<string, string \| undefined>`, nên `required()` trong `env.ts` phải kiểm tra `undefined` |
| Query params | `this.request.get('/api/v4/users', { params })` |
| Bảng tra cứu | slug channel → tên hiển thị trên sidebar |

**Key cố định → dùng union type**, TypeScript bắt khai báo đủ mọi key:
```ts
type LoginError = 'invalidCredentials' | 'sessionExpired';

const errorIds: Record<LoginError, string> = {
    invalidCredentials: 'api.user.login.invalid_credentials_email_username',
    sessionExpired: 'api.context.session_expired.app_error',
};
```
Thêm key mới vào `LoginError` mà quên khai báo thì TypeScript báo lỗi ngay.

Value không nhất thiết là `string`, ví dụ `Record<string, number>` cho status code mong đợi.

**⚠️ Lưu ý:** với `Record<string, …>`, TypeScript tin rằng key nào cũng tồn tại:
```ts
const channelNames: Record<string, string> = { 'town-square': 'Town Square' };
const name = channelNames['typo-here'];   // TS says: string. Reality: undefined
name.toUpperCase();                        // 💥 crashes at runtime
```
- Biết trước danh sách key → dùng union type (nên ưu tiên).
- Key thật sự động → bật `"noUncheckedIndexedAccess": true` trong `tsconfig.json`, TypeScript sẽ coi kết quả là `string | undefined`.

### 4. `async` và `Promise<APIResponse>`
```ts
async login(username: string, password: string): Promise<APIResponse>
```
Nghĩa là: **"hàm `login` cần chờ server. Khi `await` nó, bạn nhận được một `APIResponse`."**

| Phần | Ý nghĩa |
|---|---|
| `async` | Hàm có bước phải chờ (gọi mạng). Bên trong mới dùng được `await` |
| `Promise<…>` | Hàm `async` luôn trả về `Promise`, giống **phiếu hẹn**: nhận ngay, có kết quả sau |
| `APIResponse` | Kiểu của kết quả bên trong phiếu hẹn: một HTTP response của Playwright |

```ts
const p = api.login(user, pass);               // p: Promise<APIResponse>  → just the ticket
const response = await api.login(user, pass);  // response: APIResponse → the actual result
```

**Lỗi hay gặp: quên `await`.**
```ts
const response = api.login(user, pass);   // forgot await
response.status();                         // ❌ TS error: 'status' does not exist on type 'Promise<APIResponse>'
```
`strict: true` bắt được lỗi này. Rule ESLint `no-floating-promises` còn bắt được cả trường hợp gọi hàm mà không dùng kết quả.

**Các method của `APIResponse`:**

| Method | Trả về |
|---|---|
| `response.status()` | `200`, `401`… |
| `response.ok()` | `true` nếu status từ 200 đến 299 |
| `response.headers()` | `Record<string, string>` |
| `await response.json()` | body đã chuyển thành object |
| `await response.text()` | body dạng chuỗi |

`json()` và `text()` cũng cần `await`, vì đọc body cũng là việc phải chờ.

**Các kiểu trả về tương tự:**

| Kiểu | Ý nghĩa | Ví dụ |
|---|---|---|
| `Promise<APIResponse>` | chờ xong nhận response | `login()`, `getMe()` |
| `Promise<void>` | chờ xong, không trả gì | `sendMessage()`, `goto()` trong page object |
| `Promise<string>` | chờ xong nhận chuỗi | ví dụ `getToken()` |

`goto()`, `sendMessage()` trong page object không ghi kiểu trả về, TypeScript tự suy ra `Promise<void>`. Ghi rõ hay để tự suy đều được, chỉ cần thống nhất trong cả repo.

### Kiểm tra kết quả
```
$ npm run typecheck          # no errors
$ npm run test:api
  ✓  [api] › tests/api/auth.spec.ts › Login via API › rejects a request without a token (29ms)
  ✓  [api] › tests/api/auth.spec.ts › Login via API › rejects invalid credentials (32ms)
  ✓  [api] › tests/api/auth.spec.ts › Login via API › logs in with valid credentials (411ms)
  ✓  [api] › tests/api/auth.spec.ts › Login via API › returns the logged-in user (5ms)
  4 passed (654ms)
$ npm run test:web           # fixture file changed, web tests still pass
  7 passed (7.8s)
```
4 test API chạy dưới 1 giây, trong khi 7 test web mất khoảng 8 giây. Đây là lý do nên tạo dữ liệu test qua API thay vì qua UI.

### Tiếp theo
- Thêm vào `MattermostApi`: lấy channel theo tên, tạo post, đọc post. Viết test API tương ứng với phần còn lại của collection Postman.
- Khi test Playwright đã bao phủ hết collection: xóa `postman/`, `scripts/run-postman.mts` và script `test:postman`.

---

## Ghi chú — 04/10/2026: Thêm ESLint, hạ TypeScript 7 → 6

### Mục tiêu
Thêm lint để bắt những lỗi mà `tsc` không bắt được, nhất là **quên `await`**: lỗi phổ biến nhất trong Playwright và hay gây test flaky.

### Đã làm
- [x] Hạ TypeScript từ `^7.0.2` xuống `~6.0.3`
- [x] Cài `eslint` 10.12.0, `@eslint/js`, `typescript-eslint` 8.71.0, `eslint-plugin-playwright` 2.12.0
- [x] `eslint.config.mjs` + script `npm run lint`
- [x] Thêm kiểu `User`, `ApiError` trong `src/api/types.ts`, sửa 5 lỗi lint trong `tests/api/auth.spec.ts`
- [x] README: thêm `npm run lint` vào bảng script (cả 2 ngôn ngữ)

### Vì sao không chỉ dựa vào `tsc`
TypeScript bắt được lỗi dùng kết quả mà quên `await`, nhưng **không bắt được lỗi gọi hàm như một câu lệnh riêng mà quên `await`**:
```ts
page.click('button');              // ❌ no TS error — the test moves on before the click finishes
const r = api.getMe(); r.status(); // ✅ TS error — this case is caught
```
Rule `@typescript-eslint/no-floating-promises` bắt được trường hợp đầu.

### Quyết định: hạ TypeScript 7 → 6
- **Vấn đề:** `typescript-eslint` 8.71.0 yêu cầu `typescript: >=4.8.4 <6.1.0`. Repo đang dùng TS 7.0.2 (có từ lúc setup, vì `npm install typescript` lấy bản `latest`), nên `npm install` sẽ báo lỗi peer dependency.
- **Các lựa chọn đã cân nhắc:**

  | Lựa chọn | Ưu điểm | Nhược điểm |
  |---|---|---|
  | **Hạ xuống TS `~6.0.3` + ESLint (đã chọn)** | Lint được hỗ trợ đầy đủ. ESLint và `eslint-plugin-playwright` là công cụ phổ biến trong ngành | Phải nâng lại khi `typescript-eslint` hỗ trợ TS 7 |
  | Ép cài bằng `--legacy-peer-deps` | Giữ TS 7 | Chạy trên tổ hợp chưa được hỗ trợ, lỗi khó đoán |
  | oxlint + `oxlint-tsgolint` | Xây trên typescript-go (TS 7), rất nhanh | Mới, ít người dùng. Chưa kiểm chứng có rule cho Playwright |
  | Biome | Lint + format trong một công cụ | Không có rule cho Playwright, kiểm tra theo kiểu yếu hơn |
  | Chỉ dùng Prettier | Không vướng gì | Không bắt được lỗi logic |

- **Số liệu lượt tải npm trong tuần (04/10/2026):** TS 5.x 64,6%, **6.x 15,3%**, **7.x 10,6%**. TS 6 đang được dùng nhiều hơn TS 7, nên hạ xuống không phải là dùng công nghệ lạc hậu.
- **Rủi ro khi hạ:** thấp.
  - Code chỉ dùng TypeScript cơ bản.
  - Playwright tự chuyển TypeScript sang JavaScript bằng công cụ riêng, không dùng `tsc` của project. `tsc` chỉ dùng cho `npm run typecheck`.
  - Rủi ro duy nhất: phải nâng cấp lại sau này.
- **Ghim bằng `~` thay vì `^`:** `~6.0.3` chỉ nhận bản vá 6.0.x. Nếu dùng `^`, khi TS 6.1 ra npm có thể tự nâng lên, vượt giới hạn `<6.1.0` của `typescript-eslint`, và lint lại hỏng.
- **Khi nào nâng lại lên TS 7:** khi `typescript-eslint` hỗ trợ. Cách kiểm tra:
  ```bash
  npm view typescript-eslint peerDependencies
  ```

### `eslint.config.mjs`
| Phần | Ý nghĩa |
|---|---|
| Đuôi `.mjs` | `package.json` là `"type": "commonjs"`. `.mjs` báo cho Node biết file này dùng `import`/`export` |
| `// @ts-check` | VS Code kiểm tra kiểu ngay trong file config |
| `eslint.configs.recommended` | Bộ rule cơ bản của JavaScript |
| `tseslint.configs.recommendedTypeChecked` | Rule TypeScript có dùng thông tin kiểu, trong đó có `no-floating-promises` |
| `projectService` + `allowDefaultProject` | ESLint đọc `tsconfig.json` để biết kiểu. `eslint.config.mjs` không nằm trong `include` của tsconfig, nên nếu thiếu `allowDefaultProject` sẽ báo lỗi `was not found by the project service` |
| `files: ['tests/**/*.ts']` + Playwright `flat/recommended` | Rule Playwright (`no-focused-test`, `expect-expect`…) chỉ áp dụng cho file test, không áp dụng cho page object |

### Lỗi ESLint tìm ra: `any` từ `response.json()`
Lần chạy lint đầu tiên báo 5 lỗi trong `tests/api/auth.spec.ts`:
```
Unsafe assignment of an `any` value               @typescript-eslint/no-unsafe-assignment
Unsafe member access .username on an `any` value  @typescript-eslint/no-unsafe-member-access
Unsafe member access .id on an `any` value        @typescript-eslint/no-unsafe-member-access
```
- **Nguyên nhân:** `response.json()` trả về `Promise<any>`. Với `any`, TypeScript bỏ qua mọi kiểm tra: gõ sai `user.usernmae` vẫn không báo lỗi. Đây là chỗ mà `strict: true` để lọt.
- **Cách sửa:** khai báo kiểu cho response trong `src/api/types.ts`, rồi ép kiểu:
  ```ts
  const user = (await response.json()) as User;
  const error = (await response.json()) as ApiError;
  ```
- **Lưu ý:** `as User` là **lời hứa** với TypeScript, không phải phép kiểm tra lúc chạy. Nếu server trả về sai cấu trúc, TypeScript vẫn tin. Kiểm tra thật lúc chạy sẽ làm sau bằng `zod`.

### Kiểm tra ESLint bắt được lỗi thật
Gài lỗi tạm, chạy `npx eslint tests/web`, rồi hoàn tác:

| Gài lỗi | ESLint báo |
|---|---|
| Xóa `await` trước `channelPage.sendMessage(message)` (2 chỗ) | 2 lỗi `@typescript-eslint/no-floating-promises` |
| `test.describe(` → `test.describe.only(` | 1 lỗi `playwright/no-focused-test` |

### Kiểm tra kết quả
```
$ npx tsc -v                 # Version 6.0.3
$ npm run typecheck          # no errors
$ npm run lint               # no errors
$ npm audit                  # found 0 vulnerabilities
$ npm run test:api           # 4 passed (614ms)
$ npm run test:web           # 7 passed (7.8s)
```
Chạy lại toàn bộ test sau khi hạ TypeScript và sửa `auth.spec.ts`: không có test nào hỏng.

### Tiếp theo
- Thêm Prettier thành một đợt riêng, để commit format không bị trộn với commit lint.
- Kiểm tra response lúc chạy bằng `zod`, thay cho `as`.

---

## Ghi chú — 04/10/2026: Thêm Prettier

### Mục tiêu
Tự động hóa việc format code, để không còn lỗi khoảng trắng, xuống dòng hay thiếu dòng trống cuối file (như ở `package.json` Ngày 7), và để review chỉ tập trung vào logic.

### Prettier dùng để làm gì
**Prettier là công cụ tự động format code.** Nó chỉ lo phần **trình bày** (code trông thế nào), không lo phần **logic** (code chạy đúng hay sai).

Ví dụ trong repo trước khi có Prettier:
```ts
constructor(private readonly request: APIRequestContext) { }   // space inside {}
"test:api": "playwright test --project=api",    "report": ...  // two keys on one line (Day 7)
}                                                               // no newline at end of file
```

| Prettier lo | Prettier không lo |
|---|---|
| Thụt lề | Quên `await` → việc của **ESLint** |
| Nháy đơn hay nháy kép | Sai kiểu dữ liệu → việc của **TypeScript** |
| Có `;` hay không | Test assert sai → việc của người viết test |
| Dòng quá dài thì tự xuống dòng | |
| Dấu phẩy cuối, dòng trống cuối file | |

**Vì sao cần:**
1. **Khỏi phải nghĩ về format:** viết sao cũng được, lưu file là code tự gọn.
2. **Review chỉ tập trung vào logic:** diff không còn lẫn những dòng chỉ đổi dấu cách.
3. **Cả team code giống nhau:** `.prettierrc.json` quyết định thay cho việc tranh luận "4 hay 2 dấu cách".
4. **CI chặn được code chưa format:** `npm run format:check` fail nếu có file sai format.

**Bộ 3 công cụ kiểm tra của repo:**

| Công cụ | Câu hỏi nó trả lời | Lệnh |
|---|---|---|
| **Prettier** | Code **trông** có gọn, thống nhất không? | `npm run format` |
| **ESLint** | Code có **thói quen xấu** hay lỗi dễ mắc không? | `npm run lint` |
| **TypeScript** | Code có dùng **đúng kiểu** không? | `npm run typecheck` |

### Đã làm
- [x] Cài `prettier` 3.9.9
- [x] `.prettierrc.json` + `.prettierignore`
- [x] Script `npm run format` (sửa file) và `npm run format:check` (chỉ kiểm tra, dùng cho CI sau này)
- [x] Format toàn repo một lần, trong một commit riêng
- [x] README: thêm 2 script vào bảng (cả 2 ngôn ngữ)
- [x] VS Code: cài extension Prettier, bật format khi lưu file cho project (`.vscode/`)

### Cấu hình: chọn theo phong cách code đang có
Mục tiêu là **diff format nhỏ nhất**, không đổi phong cách code mà repo đang dùng.

| Option | Giá trị | Vì sao |
|---|---|---|
| `tabWidth` | `4` | Code TypeScript đang dùng 4 dấu cách |
| `singleQuote` | `true` | Code đang dùng dấu nháy đơn |
| `semi` | `true` | Code đang có `;` |
| `trailingComma` | `"all"` | Code đã có dấu phẩy cuối trong object/mảng nhiều dòng. Thêm dòng mới thì diff chỉ có 1 dòng |
| `printWidth` | `120` | Mặc định 80 quá hẹp với tên test và locator dài. 120 là giá trị phổ biến |
| JSON, YAML: `tabWidth: 2` | | `package.json` do npm quản lý, luôn dùng 2 dấu cách. YAML thường dùng 2 |
| YAML: `singleQuote: false` | | File Docker Compose thường dùng nháy kép. Không có override này, Prettier sẽ đổi cả file sang nháy đơn |

### Không format những gì (`.prettierignore`)
| File | Lý do |
|---|---|
| `package-lock.json` | Do npm sinh ra |
| `postman/` | Xuất từ ứng dụng Postman. Mỗi lần xuất lại sẽ mất format, nên format chỉ tạo diff thừa |
| `*.md` | Prettier căn lại bảng Markdown bằng cách thêm dấu cách, tạo diff rất lớn ở README và devlog |

Prettier 3 tự bỏ qua các file trong `.gitignore` (`node_modules/`, `playwright-report/`…).

### Chỗ Prettier làm code khó đọc hơn: dùng `// prettier-ignore`
Trong `scripts/run-postman.mts`, tham số của Newman được viết theo cặp `cờ, giá trị` trên cùng một dòng:
```ts
'--env-var', `username=${required('MM_ADMIN_USERNAME')}`,
```
Prettier tách mỗi phần tử thành một dòng riêng, nên không còn nhìn ra cờ nào đi với giá trị nào. Cách xử lý: đặt `// prettier-ignore` ngay trước mảng, kèm comment giải thích lý do. Chỉ nên dùng khi format tự động thực sự làm code khó đọc hơn, không dùng để né quy tắc.

### Có cần `eslint-config-prettier` không?
Không cần. Package này tắt các rule ESLint về format để không đụng nhau với Prettier. Nhưng `@eslint/js` và `typescript-eslint` bản mới không còn rule format trong bộ `recommended`. Đã kiểm tra: sau khi format, `npm run lint` vẫn không lỗi.

### Commit format riêng và `.git-blame-ignore-revs`
- Thay đổi format nằm trong **một commit riêng**, không trộn với commit thay đổi logic. Người review bỏ qua commit đó, các commit khác vẫn dễ đọc.
- Commit format làm `git blame` hiện commit format cho các dòng bị đổi, thay vì commit thật sự viết ra dòng đó. Cách khắc phục: ghi hash của commit format vào `.git-blame-ignore-revs`. GitHub tự đọc file này. Trên máy cá nhân:
  ```bash
  git config blame.ignoreRevsFile .git-blame-ignore-revs
  ```

### VS Code: tự format khi lưu file
- Cài extension **Prettier - Code formatter**:
  ```bash
  code --install-extension esbenp.prettier-vscode
  ```
- `.vscode/settings.json`: cấu hình **cho project**, không đặt trong cài đặt chung của VS Code, nên không ảnh hưởng repo khác. Commit file này để ai clone repo cũng được cùng cấu hình.
  ```jsonc
  {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    // Markdown is in .prettierignore; skip it here too so tables are not reformatted on save
    "[markdown]": {
      "editor.formatOnSave": false
    }
  }
  ```

  | Setting | Ý nghĩa |
  |---|---|
  | `editor.formatOnSave` | Format mỗi khi lưu file (`Cmd+S`) |
  | `editor.defaultFormatter` | Dùng Prettier để format, không dùng formatter có sẵn của VS Code (2 bên có thể format khác nhau) |
  | `[markdown]` → `formatOnSave: false` | Không format Markdown khi lưu, cùng lý do với `*.md` trong `.prettierignore` |

- `.vscode/extensions.json`: gợi ý cài Prettier và ESLint. Người clone repo mở bằng VS Code sẽ được hỏi có cài không.
  ```json
  {
    "recommendations": ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]
  }
  ```
- **Thử:** reload VS Code (`Cmd+Shift+P` → **Developer: Reload Window**). Mở một file `.ts`, thêm vài dấu cách thừa hoặc đổi `'` thành `"`, rồi `Cmd+S` → code phải tự về đúng format. Nếu không thấy gì, xem lỗi ở **View → Output → Prettier**.

### Cách dùng ESLint và Prettier hằng ngày

#### Prettier và ESLint khác nhau thế nào
| | Prettier | ESLint |
|---|---|---|
| Có tự sửa code không? | Có (`npm run format`, hoặc `Cmd+S`) | Mặc định **không**, chỉ báo lỗi. `--fix` chỉ sửa được một số rule |
| Có đổi cách code chạy không? | **Không bao giờ** | Không. Nhưng **lỗi nó tìm ra thường là lỗi logic thật**, và người viết phải sửa logic |
| Mục đích | Code **trông** thống nhất | Code **đúng** hơn, ít bug hơn. Giống một người review tự động |

Ví dụ lỗi logic mà ESLint tìm ra trong repo này:
- **Quên `await`** (`no-floating-promises`): test chạy tiếp trước khi click hoặc gửi tin nhắn xong → test flaky, hoặc **pass sai**.
- **`test.only`** (`no-focused-test`): lỡ commit thì các test khác **bị bỏ qua mà không ai biết**.
- **`any` từ `response.json()`** (`no-unsafe-*`): gõ sai `user.usernmae` mà không bị báo lỗi.

#### Lúc đang viết code (VS Code)
| Công cụ | Cách thấy | Cần gì |
|---|---|---|
| Prettier | `Cmd+S` → code tự gọn | Extension Prettier + `formatOnSave` |
| ESLint | Gạch đỏ **ngay khi gõ**, chưa cần lưu. Rê chuột vào để xem tên rule | Extension ESLint (`dbaeumer.vscode-eslint`) |

`Cmd+Shift+M` mở bảng **Problems**, xem tất cả lỗi ESLint và TypeScript của các file đang mở.

#### Bằng lệnh
| Lệnh | Tác dụng |
|---|---|
| `npm run format:check` | Prettier: **chỉ kiểm tra**, liệt kê file sai format |
| `npm run format` | Prettier: **sửa** toàn bộ repo |
| `npx prettier --check <file>` / `--write <file>` | Prettier: kiểm tra / sửa 1 file |
| `npm run lint` | ESLint: kiểm tra toàn bộ repo, in ra file, số dòng và tên rule |
| `npx eslint <file>` | ESLint: kiểm tra 1 file |
| `npm run lint -- --fix` | ESLint: tự sửa những lỗi sửa được. Lỗi như quên `await` thì **không tự sửa**, vì ESLint không đoán được ý người viết |

`--` trong `npm run lint -- --fix` dùng để truyền `--fix` vào `eslint`, thay vì để npm hiểu `--fix` là tham số của npm.

#### Thói quen trước khi commit
```bash
npm run format:check && npm run lint && npm run typecheck
```
`&&` nghĩa là chỉ chạy lệnh sau khi lệnh trước pass. Sau này CI cũng chạy đúng chuỗi lệnh này, trước bước test.

#### Thử tận mắt
**Prettier:**
1. Trong một file `.ts`, đổi `'...'` thành `"..."` và thêm vài dấu cách thừa.
2. `npx prettier --check <file>` → báo `[warn]`.
3. `Cmd+S` → code tự trở lại như cũ. Chạy lại lệnh check → hết cảnh báo.

**ESLint:**
1. Xóa một `await` trước lời gọi API hoặc page object, hoặc thêm `.only` vào `test(`.
2. VS Code hiện gạch đỏ ngay.
3. `npx eslint <file>` → báo lỗi kèm tên rule (`no-floating-promises`, `no-focused-test`).
4. Hoàn tác (`Cmd+Z`).

### Kiểm tra kết quả
```
$ npm run format:check       # All matched files use Prettier code style!
$ npm run lint               # no errors
$ npm run typecheck          # no errors
$ docker compose -f docker/docker-compose.yml --env-file .env config -q   # valid
$ npm run test:api           # 4 passed (662ms)
$ npm run test:web           # 7 passed (7.1s)
```
Kiểm tra lại `docker compose config` vì Prettier có sửa file YAML: đổi khoảng cách trước comment và thêm dòng trống cuối file.

### Tiếp theo
- Kiểm tra response lúc chạy bằng `zod`, thay cho `as`.
- Khi làm CI: chạy `format:check`, `lint`, `typecheck` trước bước test.

---

## Ngày 8 — 05/10/2026: Tách API client: lớp HTTP dùng chung + client theo nhóm

### Mục tiêu
Tách `MattermostApi` thành một lớp HTTP dùng chung và các client theo nhóm endpoint, chuẩn bị cho các test API còn lại của collection Postman. Đây là refactor: **đổi cấu trúc, không đổi hành vi**.

### Đã làm
- [x] `src/api/ApiClient.ts`: lớp HTTP. Lưu token, thêm tiền tố `/api/v4`, có `get` / `post` / `delete` tự gắn `Authorization: Bearer`
- [x] `src/api/UsersApi.ts`: `login()` (lưu token vào `ApiClient` qua `setToken`), `getMe()`
- [x] `MattermostApi` chỉ còn là facade: tạo **một** `ApiClient`, rồi đưa nó cho `users`
- [x] Sửa các chỗ gọi cũ: `api.login(...)` → `api.users.login(...)`, `.getMe()` → `.users.getMe()` (trong `src/fixtures/index.ts` và `tests/api/auth.spec.ts`)
- Chuyển sang Ngày 9: `ChannelsApi`, `PostsApi` và type `Channel` / `Post` / `NewPost`. Như vậy Ngày 8 chỉ là refactor, không thêm tính năng mới.

### Cấu trúc mới
```
src/api/
├── ApiClient.ts        # HTTP layer: token, /api/v4 prefix, get/post/delete
├── UsersApi.ts         # /users/*
├── MattermostApi.ts    # facade: api.users (Ngày 9: + api.channels, api.posts)
└── types.ts
```
- `ApiClient` chỉ lo phần HTTP, không biết nghiệp vụ. Vì vậy `post(path, data?: unknown)` nhận body kiểu `unknown`. Kiểm tra type body là việc của các client theo nhóm.
- Test gọi `api.users.login(...)`, sau này là `api.posts.create(...)`, chia nhóm giống tài liệu API của Mattermost.

### Quyết định: composition, không dùng kế thừa
Nếu viết `class UsersApi extends ApiClient`, mỗi object `UsersApi` và `PostsApi` sẽ có **`token` riêng**. Login qua `users` xong thì `posts` vẫn chưa có token, request sẽ bị `401`.

Vì vậy `MattermostApi` tạo **một** `ApiClient` rồi truyền vào constructor của từng client. Token chỉ lưu ở một chỗ, login một lần là mọi nhóm đều dùng được.

### Mối liên hệ giữa các lớp và lý do thiết kế
```
        test  (posts.spec.ts, auth.spec.ts)
          │  only knows api.users / api.channels / api.posts
          ▼
┌──────────────────────┐
│    MattermostApi     │  Facade: entry point, wires the parts together
└──────────────────────┘
     │        │        │      creates and holds
     ▼        ▼        ▼
 UsersApi ChannelsApi PostsApi  Domain: which endpoint, which body, what to name it
     │        │        │      all receive the SAME instance
     └────────┼────────┘
              ▼
┌──────────────────────┐
│      ApiClient       │  HTTP: token, /api/v4 prefix, get/post/delete
└──────────────────────┘
              ▼
   APIRequestContext (Playwright)  →  Mattermost server
```

| Lớp | Biết gì | Không biết gì |
|---|---|---|
| `ApiClient` | Gửi HTTP, gắn `Bearer`, tiền tố `/api/v4` | Login là gì, post là gì |
| `UsersApi`, `ChannelsApi`, `PostsApi` | Đường dẫn endpoint, dạng body, tên hàm theo nghiệp vụ | Token lưu ở đâu, header gắn thế nào |
| `MattermostApi` (facade) | Lắp các phần với nhau, gần như không có logic | |
| Test | Cần **làm gì** (`api.posts.create(...)`) | Client được **tạo thế nào** |

- Các nhóm **không tự tạo** `ApiClient` mà **nhận** nó qua constructor (*dependency injection*). Vì vậy cả 3 nhóm chắc chắn dùng chung một client.
- **Tách theo lý do thay đổi** (*Single Responsibility*): mỗi lớp chỉ phải sửa khi có một loại thay đổi.
  - Đổi cách xác thực, thêm log hay retry → chỉ sửa `ApiClient`.
  - Mattermost đổi đường dẫn hoặc body của post → chỉ sửa `PostsApi`.
  - Thêm nhóm API mới → thêm file mới, rồi thêm 2 dòng vào `MattermostApi`.

**Hiệu quả:**

| Tình huống | Không tách lớp (một file `MattermostApi` lớn) | Thiết kế hiện tại |
|---|---|---|
| Thêm 20 endpoint | File dài hàng trăm dòng, khó tìm | Mỗi nhóm một file nhỏ |
| Thêm log cho mọi request khi debug | Sửa từng hàm | Sửa 3 hàm trong `ApiClient` |
| Mattermost ra `/api/v5` | Tìm và thay ở mọi chỗ | Đổi `API_PREFIX` |
| Đổi cấu trúc bên trong client | Sửa mọi test | Test không đổi, vì chỉ dùng facade |
| Test phân quyền: admin và user thường | Token dùng chung, dễ bị lẫn | Tạo 2 `MattermostApi`, mỗi cái có `ApiClient` và token riêng |

Token dùng chung **bên trong** một facade, nhưng tách biệt **giữa** các facade. Đây đúng là ranh giới mà test phân quyền cần:
```ts
const member = new MattermostApi(request);
await member.users.login(memberName, memberPass);
const res = await member.posts.delete(adminPostId); // expect 403
```

**Quy tắc khi viết test:**
- Luôn đi qua facade. Không tự `new ChannelsApi(...)` hay `new ApiClient(...)` trong test: client tự tạo chưa có token nên bị `401`, và test bị phụ thuộc vào cách lắp ráp bên trong.
- Dùng fixture `api` (đã login sẵn) khi đăng nhập **không phải** thứ đang được test.
- Dùng `new MattermostApi(request)` (chưa login) khi **chính việc đăng nhập** là thứ đang được test, như trong `auth.spec.ts`.

**Cái giá phải trả:**
- Nhiều file hơn. Đọc `api.posts.create` phải mở 3 file mới thấy request thật được gửi.
- Với 2–3 endpoint, thiết kế này hơi thừa. Nó chỉ đáng giá khi số endpoint tăng lên (factory dữ liệu, test xuyên tầng, phân quyền).
- Phải giữ kỷ luật chỉ đi qua facade. Nếu test bỏ qua facade, các lợi ích ở trên mất hết.

**Tóm lại:** `ApiClient` lo **cách gửi request**, các lớp `XxxApi` lo **gửi request gì**, `MattermostApi` lo **lắp ráp**, còn test chỉ viết **cần làm gì**.

### Vấn đề gặp phải
**1. Sau khi tách, `tsc` báo 5 lỗi và `eslint` báo 45 lỗi.**
- `tsc`: `TS2339: Property 'login' does not exist on type 'MattermostApi'` (và `getMe`), ở `src/fixtures/index.ts` và `tests/api/auth.spec.ts`.
- `eslint`: hàng loạt lỗi `no-unsafe-member-access`, `no-unsafe-call`, "type that cannot be resolved".
- **Nguyên nhân:** `login` và `getMe` đã chuyển từ `MattermostApi` sang `UsersApi`, nhưng các chỗ gọi vẫn dùng tên cũ.
- 45 lỗi ESLint là **lỗi kéo theo**: TypeScript không xác định được kết quả của `api.login(...)`, nên mọi thao tác sau đó (`.status()`, `.json()`, `expect(...)`) đều bị coi là "unsafe". Sửa xong 5 lỗi `tsc` thì cả 45 lỗi ESLint đều hết. Giống bài học Ngày 7: sửa lỗi gốc trước.
- **Đây là lỗi mong đợi, không phải bug:** sau refactor, `tsc` liệt kê đúng những chỗ cần sửa. Đó là lợi ích của type.

**2. Toàn bộ 11 test fail với `ECONNREFUSED 127.0.0.1:8065`.**
- **Nguyên nhân:** Docker Desktop đang tắt nên Mattermost không chạy. Lỗi nằm ở môi trường, không phải ở code refactor.
- **Cách sửa:** bật Docker Desktop, chạy `npm run env:up`.
- **Bài học:** `ECONNREFUSED` nghĩa là không kết nối được tới server, chưa đi tới phần logic của test. Gặp lỗi này thì kiểm tra môi trường trước (`docker ps`, `curl .../api/v4/system/ping`), chưa cần đọc code.

**3. `format:check` báo 2 file, `Cmd+S` không tự sửa.**
- Lỗi: thừa dấu cách trong `auth.spec.ts`, thừa dòng trống cuối `MattermostApi.ts`.
- **Nguyên nhân:** `.vscode/settings.json` đang có `"editor.formatOnSave": false` (thay đổi chưa commit), nên lưu file không chạy Prettier.
- **Cách sửa:** chạy `npm run format`. Lệnh `format:check` vẫn bắt được lỗi dù editor không tự format, nên cần chạy nó trước khi commit.

### Kiểm tra kết quả
```
$ npm run format:check       # All matched files use Prettier code style!
$ npm run lint               # no errors
$ npm run typecheck          # no errors
$ npm run test:api           # 4 passed (621ms)
$ npm run test:web           # 7 passed (7.6s)
```
Các test giữ nguyên số lượng và các assertion, chỉ đổi cách gọi client. Refactor không làm đổi hành vi.

### Tiếp theo
- Ngày 9:
  - Viết `ChannelsApi` (`getByName`), `PostsApi` (`create`, `get`, `delete`) và type `Channel` / `Post` / `NewPost`.
  - Viết `tests/api/posts.spec.ts`: lấy channel trong `beforeAll`, tạo post (`201`), đọc lại post (`200`), test thiếu `channel_id` (`403`, dùng `@ts-expect-error`). Xóa post trong `afterEach`.
- Khi đủ 8/8 request của Postman: xóa `postman/`, `scripts/run-postman.mts`, script `test:postman`.
