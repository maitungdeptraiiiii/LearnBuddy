# LearnBuddy

LearnBuddy la ung dung hoc tap ca nhan hoa bang LLM, dua tren bai bao LearnMate. Nguoi hoc nhap chu de, muc tieu, trinh do, thoi luong va phong cach hoc; he thong tao lo trinh hoc rieng, chia bai theo tuan, goi y hoat dong, checkpoint, quiz va ho tro hoi dap voi AI tutor theo tung bai hoc.

Bai bao goc: [LearnMate: Enhancing Online Education with LLM-Powered Personalized Learning Plans and Support](https://arxiv.org/abs/2503.13340)

## Chay local

```powershell
npm install
npm run dev
```

Mo:

```text
http://127.0.0.1:3000
```

## Luong chinh

1. Nhap ho so hoc vien: chu de, muc tieu, trinh do, so tuan, gio/tuan, toc do va phong cach hoc.
2. Tao lo trinh hoc ca nhan hoa.
3. Chon tung lesson de xem checkpoint, hoat dong hoc va cap nhat trang thai.
4. Hoi AI tutor theo ngu canh lesson dang chon.

## Build Docker

```powershell
docker build -t <dockerhub-username>/learnbuddy:latest .
docker run --rm -p 3000:3000 <dockerhub-username>/learnbuddy:latest
```

Neu muon dung OpenAI that, truyen env khi chay container:

```powershell
docker run --rm -p 3000:3000 `
  -e LLM_PROVIDER=openai `
  -e OPENAI_API_KEY=<your-api-key> `
  -e OPENAI_BASE_URL=https://api.openai.com/v1 `
  -e OPENAI_CHAT_MODEL=gpt-5.4-mini `
  -e CHAT_MODEL=gpt-5.4-mini `
  <dockerhub-username>/learnbuddy:latest
```

## Huong mo rong

- Adaptive plan: tu dieu chinh lo trinh dua tren bai da hoan thanh, phan can on va diem quiz.
- Calendar view: chuyen agenda thanh lich tuan/ngay.
- Quiz evaluator: cham cau tra loi ngan va ghi lai weak topics.
- Teacher dashboard: theo doi tien do nhieu hoc vien.
- RAG extension: upload PDF/slide/giao trinh roi tao plan va tutor answer dua tren tai lieu that.
