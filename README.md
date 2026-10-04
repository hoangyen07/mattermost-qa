# Cross-Layer Test Automation for Mattermost

> **One TypeScript stack. Four test layers. One real product.**\
> Seed data through the API, then verify it on Web, Mobile, and in the database.

[English](#english) | [Tiếng Việt](#tiếng-việt)

## English

The system under test is [Mattermost](https://github.com/mattermost/mattermost), an open-source team chat
whose web app, REST API and Android/iOS apps all share one backend. That makes it possible to follow
a single action, such as sending a message, through every layer and check that they all agree.

📓 Day-by-day build log (Vietnamese): [docs/devlog.md](docs/devlog.md)

### What this project demonstrates
- **Framework design:** one TypeScript codebase shared by API, Web and Mobile tests (API client, fixtures, Page/Screen Objects, test data factory).
- **Cross-layer verification:** checking that the API, the database and the UIs all agree on the same data, not just that a screen looks right.
- **Stable, parallel-safe tests:** data created via the API, isolated per test, with a single login.
- **Beyond functional testing:** load testing with k6 and a CI pipeline on GitHub Actions.

### How a cross-layer test works
Example: sending a message.

```
1. API     POST /api/v4/posts            → create the message, get its id
2. DB      SELECT … FROM posts WHERE id  → the row exists with the right content
3. Web     open the channel in a browser → the message is displayed
4. Mobile  open the channel in the app   → the same message is displayed
```

### Test layers

| Layer | Tool | Directory | Status |
|---|---|---|---|
| API | Playwright `request` | `tests/api`, `src/api` | 🟡 In progress (login, auth) |
| Web UI | Playwright + Page Object Model | `tests/web`, `web/pages` | 🟡 In progress (login, messaging) |
| Mobile | Mobilewright + Screen Object | `tests/mobile`, `mobile/screens` | 🚧 Planned |
| Database | Postgres (`pg`) | `src/db` | 🚧 Planned |

**Supporting tools**

| Purpose | Tool | Directory | Status |
|---|---|---|---|
| Test environment | Docker Compose | `docker` | ✅ Done |
| Performance | k6 | `perf/k6` | 🚧 Planned |
| CI | GitHub Actions | `.github/workflows` | 🚧 Planned |

### Architecture

```
src/
  config/     env.ts        – load & validate environment variables
  api/        MattermostApi – API client, reused for data setup across all layers
  db/         db.ts         – queries to verify data
  data/       factory.ts    – unique test data, safe for parallel runs
  fixtures/   index.ts      – Playwright fixtures (api, channelId, page objects)
web/pages/                  – Page Objects
web/components/             – Component Objects (e.g. Sidebar)
mobile/screens/             – Screen Objects
tests/{setup,api,web,mobile}
docker/     docker-compose.yml – Mattermost + Postgres for local/CI
postman/    collection + environment – exploratory API checks (Postman / Newman)
docs/       devlog.md          – day-by-day build log
```

**Design principles**
- Create test data via the API, never through the UI → faster, less flaky tests.
- Cross-layer verification: API response → DB → Web/Mobile.
- Log in once (setup project + `storageState`) instead of before every test.
- Each test creates its own data and does not depend on execution order.

### Running locally

Requires Node.js 20+ and Docker.

```bash
npm ci
cp .env.example .env
npx playwright install chromium
npm run env:up          # Mattermost + Postgres, waits until healthy (~1 minute)

# Create the admin user and team from .env (one time)
docker exec mm-app /mattermost/bin/mmctl --local user create --username qaadmin --email qaadmin@example.com --password 'Passw0rd!123' --system-admin --email-verified
docker exec mm-app /mattermost/bin/mmctl --local team create --name qa-team --display-name "QA Team"
docker exec mm-app /mattermost/bin/mmctl --local team users add qa-team qaadmin

npm run test:api
npm run test:web
npm run report          # open the HTML report
```

| Script | Purpose |
|---|---|
| `npm run env:up` / `env:down` | Start / stop the environment (data is kept) |
| `npm run env:reset` | Stop and **delete all data** |
| `npm run typecheck` | Type-check all TypeScript code |
| `npm run lint` | Lint with ESLint (typescript-eslint + Playwright rules) |
| `npm run format` / `format:check` | Format with Prettier / check formatting without changing files |
| `npm run test:api` | Run the API tests (Playwright `request`, no browser) |
| `npm run test:postman` | Run the Postman collection with Newman, using credentials from `.env` |

> 🚧 Planned: `npm run seed` to replace the manual `mmctl` commands.

#### Mobile (Android)
1. Start an Android emulator, check it with `adb devices`, then set `MOBILE_DEVICE_ID` in `.env`.
2. Install the Mattermost APK (from the GitHub Releases of `mattermost/mattermost-mobile`): `adb install mattermost.apk`.
3. `npx mobilewright doctor` → `npm run test:mobile`.

> The emulator reaches the server on the host machine via `http://10.0.2.2:8065`.

#### Performance
```bash
k6 run -e USER=qaadmin -e PASS='Passw0rd!123' -e TEAM=qa-team perf/k6/post-message.load.js
```

### To do (practice roadmap)
- [ ] Re-check web locators with `npx playwright codegen http://localhost:8065`
- [ ] Re-check mobile locators with the Mobilewright Inspector
- [ ] API: add tests for users, channels, schema validation
- [ ] Web: add flows for creating a channel, replying in a thread, uploading a file
- [ ] Mobile: send a message from the app → verify on web + DB
- [ ] Run the mobile job on CI with an emulator
- [ ] Add `@smoke` / `@regression` tags and split the pipeline
- [ ] (Optional) Compare with ARTEMIS for exploratory testing

### References
- [Mattermost Mobile releases](https://github.com/mattermost/mattermost-mobile/releases): Android APK / iOS builds used for mobile tests

---

## Tiếng Việt

Hệ thống được test là [Mattermost](https://github.com/mattermost/mattermost), một ứng dụng chat nhóm mã nguồn mở
có web app, REST API và app Android/iOS dùng chung một backend. Nhờ vậy có thể theo dõi một thao tác,
ví dụ gửi tin nhắn, qua từng tầng và kiểm tra các tầng có khớp nhau không.

📓 Quá trình xây dựng theo từng ngày: [docs/devlog.md](docs/devlog.md)

### Project này thể hiện điều gì
- **Thiết kế framework:** một codebase TypeScript dùng chung cho test API, Web và Mobile (API client, fixtures, Page/Screen Object, factory tạo test data).
- **Verify xuyên tầng:** kiểm tra API, database và giao diện cùng khớp một dữ liệu, không chỉ kiểm tra màn hình hiển thị đúng.
- **Test ổn định, chạy song song an toàn:** dữ liệu tạo qua API, mỗi test dùng dữ liệu riêng, chỉ đăng nhập một lần.
- **Không chỉ test chức năng:** có load test bằng k6 và pipeline CI trên GitHub Actions.

### Một test xuyên tầng hoạt động thế nào
Ví dụ: gửi tin nhắn.

```
1. API     POST /api/v4/posts            → tạo tin nhắn, lấy id
2. DB      SELECT … FROM posts WHERE id  → có bản ghi với đúng nội dung
3. Web     mở channel trên trình duyệt   → tin nhắn hiển thị
4. Mobile  mở channel trên app           → cùng tin nhắn đó hiển thị
```

### Các tầng test

| Tầng | Công cụ | Thư mục | Trạng thái |
|---|---|---|---|
| API | Playwright `request` | `tests/api`, `src/api` | 🟡 Đang làm (đăng nhập, xác thực) |
| Web UI | Playwright + Page Object Model | `tests/web`, `web/pages` | 🟡 Đang làm (login, gửi tin nhắn) |
| Mobile | Mobilewright + Screen Object | `tests/mobile`, `mobile/screens` | 🚧 Dự kiến |
| Database | Postgres (`pg`) | `src/db` | 🚧 Dự kiến |

**Công cụ hỗ trợ**

| Mục đích | Công cụ | Thư mục | Trạng thái |
|---|---|---|---|
| Môi trường test | Docker Compose | `docker` | ✅ Xong |
| Performance | k6 | `perf/k6` | 🚧 Dự kiến |
| CI | GitHub Actions | `.github/workflows` | 🚧 Dự kiến |

### Kiến trúc

```
src/
  config/     env.ts        – đọc & validate biến môi trường
  api/        MattermostApi – API client, dùng lại cho setup data ở mọi tầng
  db/         db.ts         – query verify dữ liệu
  data/       factory.ts    – test data unique, chạy song song an toàn
  fixtures/   index.ts      – Playwright fixtures (api, channelId, page objects)
web/pages/                  – Page Objects
web/components/             – Component Objects (vd. Sidebar)
mobile/screens/             – Screen Objects
tests/{setup,api,web,mobile}
docker/     docker-compose.yml – Mattermost + Postgres chạy local/CI
postman/    collection + environment – khám phá API bằng Postman / Newman
docs/       devlog.md          – nhật ký xây dựng theo từng ngày
```

**Nguyên tắc thiết kế**
- Tạo test data bằng API, không tạo qua UI → test nhanh và ít flaky.
- Verify xuyên tầng: API response → DB → Web/Mobile.
- Đăng nhập một lần (setup project + `storageState`), không login lại mỗi test.
- Mỗi test tự tạo dữ liệu riêng, không phụ thuộc thứ tự chạy.

### Chạy local

Cần Node.js 20+ và Docker.

```bash
npm ci
cp .env.example .env
npx playwright install chromium
npm run env:up          # Mattermost + Postgres, chờ đến khi healthy (~1 phút)

# Tạo admin và team theo .env (chỉ cần một lần)
docker exec mm-app /mattermost/bin/mmctl --local user create --username qaadmin --email qaadmin@example.com --password 'Passw0rd!123' --system-admin --email-verified
docker exec mm-app /mattermost/bin/mmctl --local team create --name qa-team --display-name "QA Team"
docker exec mm-app /mattermost/bin/mmctl --local team users add qa-team qaadmin

npm run test:api
npm run test:web
npm run report          # mở HTML report
```

| Script | Tác dụng |
|---|---|
| `npm run env:up` / `env:down` | Bật / tắt môi trường (giữ dữ liệu) |
| `npm run env:reset` | Tắt và **xóa toàn bộ dữ liệu** |
| `npm run typecheck` | Kiểm tra kiểu toàn bộ code TypeScript |
| `npm run lint` | Kiểm tra code bằng ESLint (typescript-eslint + rule cho Playwright) |
| `npm run format` / `format:check` | Format code bằng Prettier / chỉ kiểm tra, không sửa file |
| `npm run test:api` | Chạy test API (Playwright `request`, không mở trình duyệt) |
| `npm run test:postman` | Chạy Postman collection bằng Newman, lấy tài khoản từ `.env` |

> 🚧 Dự kiến: `npm run seed` thay cho các lệnh `mmctl` thủ công.

#### Mobile (Android)
1. Mở Android emulator, kiểm tra bằng `adb devices`, rồi điền `MOBILE_DEVICE_ID` trong `.env`.
2. Cài APK Mattermost (lấy từ GitHub Releases của `mattermost/mattermost-mobile`): `adb install mattermost.apk`.
3. `npx mobilewright doctor` → `npm run test:mobile`.

> Emulator truy cập server trên máy host qua `http://10.0.2.2:8065`.

#### Performance
```bash
k6 run -e USER=qaadmin -e PASS='Passw0rd!123' -e TEAM=qa-team perf/k6/post-message.load.js
```

### Việc cần làm (roadmap luyện tập)
- [ ] Kiểm tra lại locator web bằng `npx playwright codegen http://localhost:8065`
- [ ] Kiểm tra lại locator mobile bằng Mobilewright Inspector
- [ ] API: thêm test cho users, channels, schema validation
- [ ] Web: thêm luồng tạo channel, reply thread, upload file
- [ ] Mobile: gửi message từ app → verify trên web + DB
- [ ] Chạy mobile job trên CI với emulator
- [ ] Thêm tag `@smoke` / `@regression` và tách pipeline
- [ ] (Tùy chọn) So sánh với ARTEMIS cho exploratory testing

### Tài liệu tham khảo
- [Mattermost Mobile releases](https://github.com/mattermost/mattermost-mobile/releases): file APK Android / bản build iOS dùng cho test mobile
