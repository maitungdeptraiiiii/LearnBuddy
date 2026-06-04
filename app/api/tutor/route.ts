import { NextResponse } from 'next/server'
import type { ChatMessage, LearningPlan, Lesson } from '@/lib/types'
import { lawRagChatText } from '@/lib/law-rag-llm'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    question: string
    plan: LearningPlan
    lesson: Lesson | null
    history: ChatMessage[]
  }

  try {
    const answer = await lawRagChatText([
      {
        role: 'system',
        content:
          'You are LearnMate, a concise Vietnamese AI tutor. Teach according to the learner profile, current lesson, plan, and recent chat. Answer in Vietnamese, concise and easy to scan. Do not use Markdown syntax: no ## headings, no **bold**, no horizontal rules, no bullet characters. Use short plain labels ending with ":" such as "Mục tiêu:", "Cách làm:", "Ví dụ:", "Bước tiếp theo:". Put each idea on its own line. Give actionable explanations and one short next step. Use homework, resources, quiz, and checkpoint to check whether the learner understands the lesson. If the learner asks for video segments, tell them to use the Video tab.'
      },
      {
        role: 'user',
        content: JSON.stringify(body)
      }
    ])

    return NextResponse.json({ answer: answer || fallbackTutorAnswer(body.question, body.lesson), mode: answer ? 'law-rag-llm' : 'fallback' })
  } catch {
    return NextResponse.json({ answer: fallbackTutorAnswer(body.question, body.lesson), mode: 'fallback' })
  }
}

function fallbackTutorAnswer(question: string, lesson: Lesson | null) {
  const topic = lesson?.title || 'bài học hiện tại'
  return `Với ${topic}, hãy xử lý câu hỏi "${question}" theo 3 bước: nắm khái niệm chính, xem một ví dụ nhỏ, rồi tự kiểm tra bằng checkpoint. Bước tiếp theo: viết lại phần bạn chưa hiểu thành một câu cụ thể để tutor giải thích sâu hơn.`
}
