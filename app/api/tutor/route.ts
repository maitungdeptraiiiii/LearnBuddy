import { NextResponse } from 'next/server'
import { TUTOR_SYSTEM_PROMPT } from '@/lib/tutor-prompt'
import type { ChatMessage, LearningPlan, Lesson } from '@/lib/types'
import { lawRagChatText } from '@/lib/law-rag-llm'

type TutorVideoReference = {
  timestamp: string
  title: string
  summary: string
  url: string
  videoTitle: string
  startSeconds: number
  endSeconds: number
  excerpt: string
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    question: string
    plan: LearningPlan
    lesson: Lesson | null
    history: ChatMessage[]
    videoReferences?: TutorVideoReference[]
  }

  try {
    const answer = await lawRagChatText([
      {
        role: 'system',
        content: `${TUTOR_SYSTEM_PROMPT}

Khi videoReferences được cung cấp, hãy xem chúng là bằng chứng retrieval từ video của bài học. Nếu có reference liên quan trực tiếp đến câu hỏi, thêm đúng một dòng "Video nên xem:" gồm nhãn timestamp và URL raw. Không bịa timestamp hoặc URL. Nếu videoReferences rỗng hoặc không liên quan, trả lời bình thường và không nhắc video.`
      },
      {
        role: 'user',
        content: JSON.stringify(body)
      }
    ])

    return NextResponse.json({ answer: answer || fallbackTutorAnswer(body.question, body.lesson, body.videoReferences), mode: answer ? 'law-rag-llm' : 'fallback' })
  } catch {
    return NextResponse.json({ answer: fallbackTutorAnswer(body.question, body.lesson, body.videoReferences), mode: 'fallback' })
  }
}

function fallbackTutorAnswer(question: string, lesson: Lesson | null, videoReferences: TutorVideoReference[] = []) {
  const topic = lesson?.title || 'bài học hiện tại'
  const videoLine = videoReferences[0] ? ` Video nên xem: ${videoReferences[0].timestamp} ${videoReferences[0].url}` : ''
  return `Với ${topic}, hãy xử lý câu hỏi "${question}" theo 3 bước: nắm khái niệm chính, xem một ví dụ nhỏ, rồi tự kiểm tra bằng checkpoint.${videoLine} Bước tiếp theo: viết lại phần bạn chưa hiểu thành một câu cụ thể để tutor giải thích sâu hơn.`
}
