# LearnMate Demo

Demo bám sát hướng LearnMate: tạo lộ trình học cá nhân hóa bằng LLM, hiển thị kế hoạch học, hỗ trợ AI tutor theo bài học hiện tại và theo dõi tiến độ.

## Chạy local

```powershell
npm install
npm run dev
```

Mở:

```text
http://127.0.0.1:3000
```

## Build Docker và push Docker Hub

Đăng nhập Docker Hub:

```powershell
docker login
```

Build image:

```powershell
docker build -t <dockerhub-username>/learnmate-demo:latest .
```

Chạy thử container:

```powershell
docker run --rm -p 3000:3000 <dockerhub-username>/learnmate-demo:latest
```

Nếu muốn dùng OpenAI thật, truyền env khi chạy container:

```powershell
docker run --rm -p 3000:3000 `
  -e LLM_PROVIDER=openai `
  -e OPENAI_API_KEY=<your-api-key> `
  -e OPENAI_BASE_URL=https://api.openai.com/v1 `
  -e OPENAI_CHAT_MODEL=gpt-5.4-mini `
  -e CHAT_MODEL=gpt-5.4-mini `
  <dockerhub-username>/learnmate-demo:latest
```

Push lên Docker Hub:

```powershell
docker push <dockerhub-username>/learnmate-demo:latest
```

## Dùng LLM theo Law-RAG

App đọc cấu hình model từ:

```text
C:\Users\Admin\Desktop\Law-RAG\.env
```

Các biến được dùng gồm `RAG_MODE`, `LLM_PROVIDER`, `CHAT_MODEL`, `OPENAI_CHAT_MODEL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `LOCAL_CHAT_MODEL`.

Nếu muốn trỏ sang thư mục Law-RAG khác, tạo `.env.local` trong demo:

```env
LAW_RAG_ROOT=C:\path\to\Law-RAG
```

Nếu không đọc được cấu hình hoặc model lỗi, app vẫn chạy bằng fallback generator để demo luồng sản phẩm.

## Luồng chính

1. Nhập hồ sơ học viên: chủ đề, mục tiêu, trình độ, số tuần, giờ/tuần, tốc độ và phong cách học.
2. Tạo lộ trình học cá nhân hóa.
3. Chọn từng lesson để xem checkpoint, hoạt động học và cập nhật trạng thái.
4. Hỏi AI tutor theo ngữ cảnh lesson đang chọn.

## Hướng mở rộng theo bài báo

- Adaptive plan: tự điều chỉnh lộ trình dựa trên lesson đã hoàn thành, phần cần ôn và điểm quiz.
- Calendar view: chuyển agenda thành lịch tuần/ngày.
- Quiz evaluator: chấm câu trả lời ngắn và ghi lại weak topics.
- Teacher dashboard: theo dõi tiến độ nhiều học viên.
- RAG extension: upload PDF/slide/giáo trình rồi tạo plan và tutor answer dựa trên tài liệu thật.
