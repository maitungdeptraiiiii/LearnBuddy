import { NextResponse } from 'next/server'
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
        content:
          'You are LearnMate, a concise Vietnamese AI tutor. Teach according to the learner profile, current lesson, plan, recent chat, and videoReferences. Answer in Vietnamese, concise and easy to scan. Do not use Markdown syntax: no ## headings, no **bold**, no horizontal rules, no bullet characters. Use short plain labels ending with ":" such as "Mục tiêu:", "Cách làm:", "Ví dụ:", "Video nên xem:", "Bước tiếp theo:". Put each idea on its own line. Give actionable explanations and one short next step. Use homework, resources, quiz, and checkpoint to check whether the learner understands the lesson. When videoReferences are provided, treat them as retrieval evidence from the lesson video. If a reference is relevant to the question, include exactly one "Video nên xem:" line with the timestamp label and the raw URL. Do not invent timestamps or URLs. If videoReferences are empty or irrelevant, answer normally and do not mention video.'
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
