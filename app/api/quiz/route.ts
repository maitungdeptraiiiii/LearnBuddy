import { NextResponse } from 'next/server'
import { QUIZ_SYSTEM_PROMPT } from '@/lib/quiz-prompt'
import { lawRagChatJson } from '@/lib/law-rag-llm'
import type { LearningPlan, Lesson, LessonQuiz, QuizQuestion, VideoSearchMatch } from '@/lib/types'

const quizSize = 10
const fallbackSkillTypes: NonNullable<QuizQuestion['skillType']>[] = ['concept', 'application', 'debugging', 'implementation', 'design']

export async function POST(request: Request) {
  const body = (await request.json()) as {
    plan?: LearningPlan
    lesson?: Lesson | null
    matches?: VideoSearchMatch[]
  }

  if (!body.plan || !body.lesson) {
    return NextResponse.json({ error: 'Thieu lo trinh hoac bai hoc de tao quiz.' }, { status: 400 })
  }

  const sourceMatches = (body.matches || []).filter((match) => match.text?.trim() || match.summary?.trim())

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
            quizFocus: {
              topic: body.plan.profile.topic,
              week: body.lesson.week,
              title: body.lesson.title,
              objective: body.lesson.objective,
              checkpoint: body.lesson.checkpoint,
              activities: body.lesson.activities,
              homework: body.lesson.homework,
              existingLessonQuizHints: body.lesson.quiz
            },
            videoSegments: sourceMatches.slice(0, 8).map((match, index) => ({
              index,
              timestamp: secondsToTimestamp(match.startSeconds, match.endSeconds),
              url: match.url,
              title: match.title,
              summary: match.summary,
              text: match.text.slice(0, 900)
            }))
          })
        }
      ],
      0.25
    )

    return NextResponse.json({ quiz: normalizeQuiz(parsed, body.plan, body.lesson, sourceMatches) })
  } catch {
    return NextResponse.json({ quiz: sourceMatches.length > 0 ? fallbackVideoQuiz(body.lesson, sourceMatches, body.plan) : fallbackQuiz(body.lesson, body.plan) })
  }
}

function normalizeQuiz(parsed: unknown, plan: LearningPlan, lesson: Lesson, matches: VideoSearchMatch[]): LessonQuiz {
  const rawQuestions = parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions) ? (parsed as { questions: unknown[] }).questions : []
  const seenQuestions = new Set<string>()
  const questions = rawQuestions
    .map((item, index) => normalizeQuestion(item, index, matches))
    .filter((item): item is QuizQuestion => {
      if (!item) return false
      const key = normalizeText(item.question)
      if (seenQuestions.has(key)) return false
      seenQuestions.add(key)
      return true
    })
    .slice(0, quizSize)

  const fallback = matches.length > 0 ? fallbackVideoQuiz(lesson, matches, plan).questions : fallbackQuiz(lesson, plan).questions
  return { lessonId: lesson.id, questions: [...questions, ...fallback].slice(0, quizSize) }
}

function normalizeQuestion(item: unknown, index: number, matches: VideoSearchMatch[]): QuizQuestion | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Partial<QuizQuestion> & { sourceIndex?: unknown }
  const options = Array.isArray(raw.options) ? raw.options.map(String).map((option) => option.trim()).filter(Boolean).slice(0, 4) : []
  const uniqueOptions = new Set(options.map(normalizeText))
  const correctIndex = Number(raw.correctIndex)
  if (typeof raw.question !== 'string' || !raw.question.trim() || options.length !== 4 || uniqueOptions.size !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null
  }

  const sourceIndex = Number(raw.sourceIndex)
  const source = Number.isInteger(sourceIndex) && matches[sourceIndex] ? matches[sourceIndex] : matches[index % Math.max(1, matches.length)]

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `question-${index + 1}`,
    question: raw.question.trim(),
    options,
    correctIndex,
    explanation: typeof raw.explanation === 'string' && raw.explanation.trim() ? raw.explanation.trim() : 'Đáp án này khớp với nội dung trong đoạn video nguồn.',
    difficulty: normalizeDifficulty(raw.difficulty, index),
    skillType: normalizeSkillType(raw.skillType, index),
    sourceTitle: source?.title,
    sourceTimestamp: source ? secondsToTimestamp(source.startSeconds, source.endSeconds) : undefined,
    sourceUrl: source?.url,
    sourceStartSeconds: source?.startSeconds
  }
}

function fallbackVideoQuiz(lesson: Lesson, matches: VideoSearchMatch[], plan?: LearningPlan): LessonQuiz {
  const questions = matches.slice(0, quizSize).map((match, index) => {
    const title = match.title || `Đoạn ${index + 1}`
    const summary = match.summary || match.text.slice(0, 120)
    const topic = plan?.profile.topic || lesson.title
    const concept = extractDomainConcept(summary || match.text || lesson.title, lesson, topic)
    const correct = concept.correct
    const difficulty = index % 5 === 4 ? 'advanced' : 'simple'
    const skillType = fallbackSkillTypes[index % fallbackSkillTypes.length]
    const challengePrompt =
      skillType === 'concept'
        ? `Trong tuần "${lesson.title}" của chủ đề ${topic}, phát biểu nào đúng nhất về ${concept.name} theo đoạn ${secondsToTimestamp(match.startSeconds, match.endSeconds)}?`
        : skillType === 'debugging'
          ? `Bài tập phát hiện lỗi về ${concept.name}: cách hiểu nào phù hợp nhất với nội dung đoạn ${secondsToTimestamp(match.startSeconds, match.endSeconds)}?`
          : skillType === 'design'
            ? `Bài tập nâng cao trong "${lesson.title}": khi áp dụng ${concept.name}, lựa chọn nào hợp lý nhất theo video?`
            : `Bài tập áp dụng ${concept.name} trong tuần "${lesson.title}": lựa chọn nào khớp nhất với đoạn video?`
    const distractors = [
      concept.distractors[0],
      concept.distractors[1],
      concept.distractors[2]
    ]
    return buildFallbackQuestion(
      {
        question: challengePrompt,
        correct,
        distractors,
        explanation: `Đáp án bám vào khái niệm "${concept.name}" trong đoạn "${title}" của video.`,
        difficulty,
        skillType
      },
      index,
      match
    )
  })

  return { lessonId: lesson.id, questions: questions.length > 0 ? questions : fallbackQuiz(lesson, plan).questions }
}

function fallbackQuiz(lesson: Lesson, plan?: LearningPlan): LessonQuiz {
  const title = lesson.title.trim()
  const objective = lesson.objective.trim()
  const checkpoint = lesson.checkpoint.trim()
  const topic = plan?.profile.topic || title
  const concept = extractDomainConcept([title, objective, checkpoint, lesson.activities.join(' '), lesson.homework.join(' ')].join(' '), lesson, topic)
  const firstActivity = lesson.activities[0] || `On lai khai niem chinh cua ${title}.`
  const firstHomework = lesson.homework[0] || `Tu lam mot bai tap nho ve ${title}.`
  const firstResource = lesson.resources[0] || `Tai lieu lien quan den ${title}.`
  const sourceQuestion = lesson.quiz[0] || `Noi dung quan trong nhat cua ${title} la gi?`
  const templates = [
    {
      question: sourceQuestion || `Khái niệm nào là trọng tâm của tuần "${title}" trong chủ đề ${topic}?`,
      correct: objective || concept.correct,
      distractors: concept.distractors,
      explanation: `Câu hỏi kiểm tra đúng trọng tâm chuyên môn của tuần "${title}".`,
      difficulty: 'simple' as const,
      skillType: 'concept' as const
    },
    {
      question: `Trong chủ đề ${topic}, người học cần chứng minh năng lực nào ở tuần ${lesson.week}?`,
      correct: checkpoint,
      distractors: concept.distractors,
      explanation: 'Checkpoint mô tả năng lực chuyên môn cần đạt ở cuối bài.',
      difficulty: 'simple' as const,
      skillType: 'application' as const
    },
    {
      question: `Hoat dong nao phu hop nhat de bat dau hoc "${title}"?`,
      correct: firstActivity,
      distractors: ['Doi sang mot chu de khong lien quan.', 'Hoc thuoc dap an mau cua tuan khac.', 'Bo qua phan nen tang cua bai hien tai.'],
      explanation: 'Hoat dong trong lesson duoc thiet ke de dan vao noi dung tuan nay.',
      difficulty: 'simple' as const,
      skillType: 'implementation' as const
    },
    {
      question: `Bai tap nao giup cung co noi dung "${title}" tot nhat?`,
      correct: firstHomework,
      distractors: ['Chi doc luot tieu de roi danh dau hoan thanh.', 'Khong lam bai tap vi da co AI tutor.', 'Dung lai cau tra loi cua tuan truoc.'],
      explanation: 'Homework la phan luyen tap truc tiep sau khi hoc.',
      difficulty: 'simple' as const,
      skillType: 'implementation' as const
    },
    {
      question: `Nguon hoc nao nen duoc uu tien khi hoc tuan ${lesson.week}?`,
      correct: firstResource,
      distractors: ['Mot tai lieu ngau nhien khong lien quan den bai.', 'Chi xem comment cua video.', 'Bo qua tai nguyen va chi hoi dap.'],
      explanation: 'Resource trong lesson la nguon duoc chon cho muc tieu tuan nay.',
      difficulty: 'simple' as const,
      skillType: 'concept' as const
    },
    {
      question: `Neu chua hieu "${title}", buoc tiep theo hop ly nhat la gi?`,
      correct: `Quay lai muc tieu "${objective}" roi hoi tutor hoac xem lai timestamp lien quan.`,
      distractors: ['Chon bua mot dap an de xem dung sai.', 'Xoa lo trinh va bat dau chu de khac ngay.', 'Bo qua checkpoint vi bai nay kho.'],
      explanation: 'Khi mac ket, nen quay ve muc tieu, dung tutor va timestamp de on dung cho.',
      difficulty: 'advanced' as const,
      skillType: 'debugging' as const
    },
    {
      question: `Dieu gi cho thay nguoi hoc da nam duoc bai "${title}"?`,
      correct: checkpoint,
      distractors: ['Da mo video mot lan nhung chua tu giai thich duoc.', 'Da chon xong dap an ma khong xem giai thich.', 'Da chuyen tab sang lich hoc.'],
      explanation: 'Nam bai nghia la dat duoc checkpoint, khong chi tuong tac voi giao dien.',
      difficulty: 'advanced' as const,
      skillType: 'application' as const
    },
    {
      question: `Vi sao quiz cua tuan ${lesson.week} nen bam sat lesson hien tai?`,
      correct: `De kiem tra dung muc tieu "${objective}" va tranh nham voi noi dung tuan khac.`,
      distractors: ['De dung chung mot bo dap an cho moi tuan.', 'De cau hoi khong can lien quan den checkpoint.', 'De nguoi hoc chi can doan nhanh.'],
      explanation: 'Quiz hieu qua phai kiem tra dung noi dung dang hoc.',
      difficulty: 'simple' as const,
      skillType: 'concept' as const
    },
    {
      question: `Khi xem video cho "${title}", doan timestamp huu ich nhat la doan nao?`,
      correct: 'Doan co noi dung lien quan truc tiep toi muc tieu, checkpoint hoac hoat dong cua bai.',
      distractors: ['Doan dai nhat cua video du khong lien quan.', 'Doan mo dau bat ky cua video.', 'Doan co tieu de giong tuan truoc.'],
      explanation: 'Timestamp chi huu ich khi no ho tro dung bai dang hoc.',
      difficulty: 'advanced' as const,
      skillType: 'design' as const
    },
    {
      question: `Sau khi tra loi sai mot cau quiz ve "${title}", nguoi hoc nen lam gi?`,
      correct: 'Doc giai thich, xem lai phan lien quan, roi thu tu dien dat lai kien thuc.',
      distractors: ['Bam dap an khac cho toi khi dung ma khong doc giai thich.', 'Bo qua toan bo quiz cua tuan nay.', 'Chi ghi nho chu cai dap an dung.'],
      explanation: 'Phan hoi sau khi sai giup bien quiz thanh hoat dong hoc that.',
      difficulty: 'advanced' as const,
      skillType: 'debugging' as const
    }
  ]

  return {
    lessonId: lesson.id,
    questions: templates.map((template, index) => buildFallbackQuestion(template, index))
  }
}

function extractDomainConcept(text: string, lesson: Lesson, topic: string) {
  const source = normalizeText([lesson.title, lesson.objective, lesson.checkpoint, text].join(' '))
  const programmingHints = ['c++', 'cpp', 'python', 'java', 'javascript', 'code', 'lap trinh', 'lập trình', 'bien', 'biến', 'kieu du lieu', 'kiểu dữ liệu', 'ham', 'hàm', 'class', 'object', 'pointer', 'con tro', 'con trỏ', 'stl', 'template']
  const calculusHints = ['giai tich', 'giải tích', 'dao ham', 'đạo hàm', 'gioi han', 'giới hạn', 'tich phan', 'tích phân', 'ham so', 'hàm số']

  if (programmingHints.some((hint) => source.includes(normalizeText(hint)))) {
    const name = source.includes('pointer') || source.includes('con tro') || source.includes('con trỏ') ? 'con trỏ/reference' : source.includes('class') || source.includes('object') ? 'class/object' : source.includes('stl') ? 'STL' : 'biến, kiểu dữ liệu hoặc cấu trúc code'
    return {
      name,
      correct: `Áp dụng đúng ${name} theo logic được giải thích trong video của tuần "${lesson.title}".`,
      distractors: [
        `Bỏ qua kiểu dữ liệu/logic code và chỉ đoán theo tên biến.`,
        `Dùng một kỹ thuật không liên quan trực tiếp đến ${name} trong bài này.`,
        `Chọn cách làm khiến code khó kiểm soát hoặc sai với nội dung video.`
      ]
    }
  }

  if (calculusHints.some((hint) => source.includes(normalizeText(hint)))) {
    const name = source.includes('dao ham') || source.includes('đạo hàm') ? 'đạo hàm' : source.includes('gioi han') || source.includes('giới hạn') ? 'giới hạn' : source.includes('tich phan') || source.includes('tích phân') ? 'tích phân' : 'hàm số'
    return {
      name,
      correct: `Thực hiện đúng bước biến đổi/tính ${name} theo quy tắc được trình bày trong video.`,
      distractors: [
        `Áp dụng công thức ${name} không đúng điều kiện của bài.`,
        `Bỏ qua bước biến đổi quan trọng trước khi tính.`,
        `Chọn kết quả chỉ dựa vào hình thức biểu thức, không theo quy tắc trong video.`
      ]
    }
  }

  return {
    name: topic || lesson.title,
    correct: text.trim() ? clampText(text, 180) : `Kiến thức trọng tâm của tuần "${lesson.title}" theo video.`,
    distractors: [
      `Một phát biểu không khớp với nội dung chuyên môn của tuần "${lesson.title}".`,
      `Một kiến thức thuộc chủ đề khác, không được video dùng để giải thích bài này.`,
      `Một cách hiểu quá chung chung, không kiểm tra được kiến thức ${topic}.`
    ]
  }
}

function buildFallbackQuestion(
  template: {
    question: string
    correct: string
    distractors: string[]
    explanation: string
    difficulty?: NonNullable<QuizQuestion['difficulty']>
    skillType?: NonNullable<QuizQuestion['skillType']>
  },
  index: number,
  source?: VideoSearchMatch
): QuizQuestion {
  const correctIndex = index % 4
  const options = template.distractors.slice(0, 3)
  options.splice(correctIndex, 0, template.correct)
  return {
    id: `fallback-${index + 1}`,
    question: template.question,
    options,
    correctIndex,
    explanation: template.explanation,
    difficulty: template.difficulty || normalizeDifficulty(undefined, index),
    skillType: template.skillType || normalizeSkillType(undefined, index),
    sourceTitle: source?.title,
    sourceTimestamp: source ? secondsToTimestamp(source.startSeconds, source.endSeconds) : undefined,
    sourceUrl: source?.url,
    sourceStartSeconds: source?.startSeconds
  }
}

function normalizeDifficulty(value: unknown, index: number): NonNullable<QuizQuestion['difficulty']> {
  return value === 'simple' || value === 'advanced' ? value : index % 5 === 4 ? 'advanced' : 'simple'
}

function normalizeSkillType(value: unknown, index: number): NonNullable<QuizQuestion['skillType']> {
  if (value === 'concept' || value === 'application' || value === 'debugging' || value === 'design' || value === 'implementation') return value
  return fallbackSkillTypes[index % fallbackSkillTypes.length]
}

function secondsToTimestamp(start: number, end?: number) {
  const format = (value: number) => {
    const total = Math.max(0, Math.floor(value))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  return typeof end === 'number' ? `${format(start)}-${format(end)}` : format(start)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function clampText(value: string, limit: number) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 3).trim()}...`
}
