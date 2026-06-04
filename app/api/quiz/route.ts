import { NextResponse } from 'next/server'
import { QUIZ_SYSTEM_PROMPT } from '@/lib/quiz-prompt'
import { lawRagChatJson } from '@/lib/law-rag-llm'
import type { LearningPlan, Lesson, LessonQuiz, QuizQuestion, VideoSearchMatch } from '@/lib/types'

const quizSize = 10

export async function POST(request: Request) {
  const body = (await request.json()) as {
    plan?: LearningPlan
    lesson?: Lesson | null
    matches?: VideoSearchMatch[]
  }

  if (!body.plan || !body.lesson) {
    return NextResponse.json({ error: 'Thieu lo trinh hoac bai hoc de tao quiz.' }, { status: 400 })
  }

  try {
    const parsed = await lawRagChatJson(
      [
        {
          role: 'system',
          content: QUIZ_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: JSON.stringify({
            learner: body.plan.profile,
            lesson: body.lesson,
            videoSegments: (body.matches || []).slice(0, 8).map((match) => ({
              title: match.title,
              summary: match.summary,
              text: match.text.slice(0, 900)
            }))
          })
        }
      ],
      0.25
    )

    return NextResponse.json({ quiz: normalizeQuiz(parsed, body.lesson) })
  } catch {
    return NextResponse.json({ quiz: fallbackQuiz(body.lesson) })
  }
}

function normalizeQuiz(parsed: unknown, lesson: Lesson): LessonQuiz {
  const rawQuestions = parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions) ? (parsed as { questions: unknown[] }).questions : []
  const seenQuestions = new Set<string>()
  const questions = rawQuestions
    .map((item, index) => normalizeQuestion(item, index))
    .filter((item): item is QuizQuestion => {
      if (!item) return false
      const key = normalizeText(item.question)
      if (seenQuestions.has(key)) return false
      seenQuestions.add(key)
      return true
    })
    .slice(0, quizSize)

  return { lessonId: lesson.id, questions: [...questions, ...fallbackQuiz(lesson).questions].slice(0, quizSize) }
}

function normalizeQuestion(item: unknown, index: number): QuizQuestion | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Partial<QuizQuestion>
  const options = Array.isArray(raw.options) ? raw.options.map(String).map((option) => option.trim()).filter(Boolean).slice(0, 4) : []
  const uniqueOptions = new Set(options.map(normalizeText))
  const correctIndex = Number(raw.correctIndex)
  if (typeof raw.question !== 'string' || !raw.question.trim() || options.length !== 4 || uniqueOptions.size !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null
  }

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `question-${index + 1}`,
    question: raw.question.trim(),
    options,
    correctIndex,
    explanation: typeof raw.explanation === 'string' && raw.explanation.trim() ? raw.explanation.trim() : 'Dap an nay phu hop nhat voi muc tieu cua bai hoc.'
  }
}

function fallbackQuiz(lesson: Lesson): LessonQuiz {
  const title = lesson.title.trim()
  const objective = lesson.objective.trim()
  const checkpoint = lesson.checkpoint.trim()
  const firstActivity = lesson.activities[0] || `On lai khai niem chinh cua ${title}.`
  const firstHomework = lesson.homework[0] || `Tu lam mot bai tap nho ve ${title}.`
  const firstResource = lesson.resources[0] || `Tai lieu lien quan den ${title}.`
  const sourceQuestion = lesson.quiz[0] || `Noi dung quan trong nhat cua ${title} la gi?`
  const templates = [
    {
      question: sourceQuestion,
      correct: objective,
      distractors: [`Chi ghi nho ten bai "${title}".`, 'Bo qua phan thuc hanh va chuyen sang tuan sau.', 'Chi xem video ma khong kiem tra lai kien thuc.'],
      explanation: 'Muc tieu bai hoc la chuan dung nhat de tu kiem tra sau khi hoc.'
    },
    {
      question: `Checkpoint cua tuan ${lesson.week} yeu cau nguoi hoc chung minh dieu gi?`,
      correct: checkpoint,
      distractors: [`Hoan thanh bai hoc ma khong can giai thich lai ${title}.`, 'Chi luu link video de xem sau.', 'Chi chon dap an nhanh ma khong doc phan hoi.'],
      explanation: 'Checkpoint mo ta nang luc can chung minh o cuoi bai.'
    },
    {
      question: `Hoat dong nao phu hop nhat de bat dau hoc "${title}"?`,
      correct: firstActivity,
      distractors: ['Doi sang mot chu de khong lien quan.', 'Hoc thuoc dap an mau cua tuan khac.', 'Bo qua phan nen tang cua bai hien tai.'],
      explanation: 'Hoat dong trong lesson duoc thiet ke de dan vao noi dung tuan nay.'
    },
    {
      question: `Bai tap nao giup cung co noi dung "${title}" tot nhat?`,
      correct: firstHomework,
      distractors: ['Chi doc luot tieu de roi danh dau hoan thanh.', 'Khong lam bai tap vi da co AI tutor.', 'Dung lai cau tra loi cua tuan truoc.'],
      explanation: 'Homework la phan luyen tap truc tiep sau khi hoc.'
    },
    {
      question: `Nguon hoc nao nen duoc uu tien khi hoc tuan ${lesson.week}?`,
      correct: firstResource,
      distractors: ['Mot tai lieu ngau nhien khong lien quan den bai.', 'Chi xem comment cua video.', 'Bo qua tai nguyen va chi hoi dap.'],
      explanation: 'Resource trong lesson la nguon duoc chon cho muc tieu tuan nay.'
    },
    {
      question: `Neu chua hieu "${title}", buoc tiep theo hop ly nhat la gi?`,
      correct: `Quay lai muc tieu "${objective}" roi hoi tutor hoac xem lai timestamp lien quan.`,
      distractors: ['Chon bua mot dap an de xem dung sai.', 'Xoa lo trinh va bat dau chu de khac ngay.', 'Bo qua checkpoint vi bai nay kho.'],
      explanation: 'Khi mac ket, nen quay ve muc tieu, dung tutor va timestamp de on dung cho.'
    },
    {
      question: `Dieu gi cho thay nguoi hoc da nam duoc bai "${title}"?`,
      correct: checkpoint,
      distractors: ['Da mo video mot lan nhung chua tu giai thich duoc.', 'Da chon xong dap an ma khong xem giai thich.', 'Da chuyen tab sang lich hoc.'],
      explanation: 'Nam bai nghia la dat duoc checkpoint, khong chi tuong tac voi giao dien.'
    },
    {
      question: `Vi sao quiz cua tuan ${lesson.week} nen bam sat lesson hien tai?`,
      correct: `De kiem tra dung muc tieu "${objective}" va tranh nham voi noi dung tuan khac.`,
      distractors: ['De dung chung mot bo dap an cho moi tuan.', 'De cau hoi khong can lien quan den checkpoint.', 'De nguoi hoc chi can doan nhanh.'],
      explanation: 'Quiz hieu qua phai kiem tra dung noi dung dang hoc.'
    },
    {
      question: `Khi xem video cho "${title}", doan timestamp huu ich nhat la doan nao?`,
      correct: 'Doan co noi dung lien quan truc tiep toi muc tieu, checkpoint hoac hoat dong cua bai.',
      distractors: ['Doan dai nhat cua video du khong lien quan.', 'Doan mo dau bat ky cua video.', 'Doan co tieu de giong tuan truoc.'],
      explanation: 'Timestamp chi huu ich khi no ho tro dung bai dang hoc.'
    },
    {
      question: `Sau khi tra loi sai mot cau quiz ve "${title}", nguoi hoc nen lam gi?`,
      correct: 'Doc giai thich, xem lai phan lien quan, roi thu tu dien dat lai kien thuc.',
      distractors: ['Bam dap an khac cho toi khi dung ma khong doc giai thich.', 'Bo qua toan bo quiz cua tuan nay.', 'Chi ghi nho chu cai dap an dung.'],
      explanation: 'Phan hoi sau khi sai giup bien quiz thanh hoat dong hoc that.'
    }
  ]

  return {
    lessonId: lesson.id,
    questions: templates.map((template, index) => buildFallbackQuestion(template, index))
  }
}

function buildFallbackQuestion(template: { question: string; correct: string; distractors: string[]; explanation: string }, index: number): QuizQuestion {
  const correctIndex = index % 4
  const options = template.distractors.slice(0, 3)
  options.splice(correctIndex, 0, template.correct)
  return {
    id: `fallback-${index + 1}`,
    question: template.question,
    options,
    correctIndex,
    explanation: template.explanation
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
