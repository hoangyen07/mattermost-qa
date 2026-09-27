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
