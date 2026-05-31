import type { LearnerProfile, LearningPlan, Lesson } from '@/lib/types'

const paceMultiplier = {
  gentle: 0.85,
  normal: 1,
  intensive: 1.2
}

const levelLabel: Record<string, string> = {
  beginner: 'người mới bắt đầu',
  intermediate: 'người đã có nền tảng',
  advanced: 'người học nâng cao'
}

type PlanPhase = {
  title: string
  objective: string
  checkpoint: string
}

type PhaseTemplate = {
  title: string
  objective: (topic: string, goal: string) => string
  checkpoint: (topic: string, goal: string, week: number) => string
}

export function generateFallbackPlan(profile: LearnerProfile): LearningPlan {
  const totalWeeks = Math.max(1, Math.min(12, profile.durationWeeks || 1))
  const minutes = Math.max(45, Math.round(profile.hoursPerWeek * 60 * paceMultiplier[profile.pace]))
  const phases = buildPhases(profile, totalWeeks)

  const lessons: Lesson[] = phases.map((phase, index) => ({
    id: `week-${index + 1}-${slugify(`${profile.topic}-${profile.goal}`).slice(0, 24)}`,
    week: index + 1,
    title: phase.title,
    objective: phase.objective,
    durationMinutes: minutes,
    activities: buildActivities(profile, index, totalWeeks),
    checkpoint: phase.checkpoint,
    quiz: buildQuiz(profile, phase, index),
    status: 'todo'
  }))

  return {
    title: `Lộ trình học ${profile.topic} trong ${totalWeeks} tuần`,
    summary: `Kế hoạch dành cho ${levelLabel[profile.level] || profile.level}, tập trung vào mục tiêu: ${profile.goal}. Nội dung được sắp từ nền tảng đến áp dụng thực tế theo phong cách học ${styleLabel(profile.learningStyle)}.`,
    profile,
    lessons
  }
}

function buildPhases(profile: LearnerProfile, totalWeeks: number): PlanPhase[] {
  const topic = clean(profile.topic)
  const goalFocus = detectGoalFocus(profile.goal)
  const sequence = phaseSequence(profile.level, goalFocus)

  return Array.from({ length: totalWeeks }, (_, index) => {
    const ratio = totalWeeks === 1 ? 1 : index / (totalWeeks - 1)
    const stage = sequence[Math.min(index, sequence.length - 1)]
    const week = index + 1

    if (ratio >= 0.8) {
      return {
        title: `Hoàn thiện sản phẩm cuối: ${topic}`,
        objective: `Tổng hợp kiến thức đã học để hoàn thành mục tiêu "${clean(profile.goal)}" bằng một sản phẩm hoặc bài thực hành có thể trình bày.`,
        checkpoint: `Có một kết quả cuối rõ ràng, giải thích được cách làm và các phần cần cải thiện tiếp theo.`
      }
    }

    return {
      title: `${stage.title}: ${topic}`,
      objective: stage.objective(topic, profile.goal),
      checkpoint: stage.checkpoint(topic, profile.goal, week)
    }
  })
}

function phaseSequence(level: string, goalFocus: string): PhaseTemplate[] {
  const beginner: PhaseTemplate[] = [
    {
      title: 'Làm quen và dựng nền tảng',
      objective: (topic: string) => `Hiểu ${topic} là gì, học các khái niệm cốt lõi và chuẩn bị môi trường học/thực hành phù hợp.`,
      checkpoint: (topic: string) => `Giải thích được ${topic} bằng ngôn ngữ đơn giản và hoàn thành một ví dụ đầu tiên.`
    },
    {
      title: 'Khái niệm trọng tâm',
      objective: (topic: string) => `Nắm các thành phần quan trọng nhất của ${topic} và biết khi nào nên dùng từng phần.`,
      checkpoint: (topic: string) => `Tự tạo được ví dụ nhỏ dùng ít nhất 2 khái niệm trọng tâm của ${topic}.`
    },
    {
      title: 'Thực hành có hướng dẫn',
      objective: (topic: string) => `Áp dụng ${topic} vào bài tập ngắn, nhận diện lỗi phổ biến và sửa theo checkpoint.`,
      checkpoint: () => `Hoàn thành bài thực hành, ghi lại lỗi gặp phải và cách sửa.`
    },
    {
      title: goalFocus,
      objective: (_topic: string, goal: string) => `Biến kiến thức đã học thành bước đầu của mục tiêu: ${clean(goal)}.`,
      checkpoint: () => `Có bản nháp đầu tiên và biết phần nào cần bổ sung ở tuần tiếp theo.`
    }
  ]

  const intermediate: PhaseTemplate[] = [
    {
      title: 'Rà soát nền tảng và lấp lỗ hổng',
      objective: (topic: string) => `Ôn nhanh ${topic}, xác định phần còn yếu và chuẩn hóa cách thực hành.`,
      checkpoint: (topic: string) => `Tự đánh giá được 3 điểm mạnh/yếu khi học ${topic}.`
    },
    {
      title: 'Kỹ thuật ứng dụng',
      objective: (topic: string) => `Dùng ${topic} để giải quyết bài toán gần với mục tiêu học, có tiêu chí đánh giá rõ ràng.`,
      checkpoint: () => `Hoàn thành một bài ứng dụng có đầu vào, đầu ra và tiêu chí kiểm tra.`
    },
    {
      title: 'Tối ưu và mở rộng',
      objective: (topic: string) => `Cải thiện cách làm với ${topic}: tổ chức lại, tối ưu hoặc thêm chức năng nâng cao.`,
      checkpoint: () => `So sánh được phiên bản trước/sau và nêu lý do cải tiến.`
    },
    {
      title: goalFocus,
      objective: (_topic: string, goal: string) => `Hoàn thiện sản phẩm/bài tập phục vụ mục tiêu: ${clean(goal)}.`,
      checkpoint: () => `Có kết quả cuối có thể demo hoặc nộp lại.`
    }
  ]

  const advanced: PhaseTemplate[] = [
    {
      title: 'Đặt bài toán và tiêu chí đánh giá',
      objective: (topic: string) => `Xác định phạm vi nâng cao của ${topic}, ràng buộc kỹ thuật và tiêu chí thành công.`,
      checkpoint: () => `Có bản đặc tả ngắn gồm mục tiêu, phạm vi và tiêu chí đánh giá.`
    },
    {
      title: 'Thiết kế giải pháp',
      objective: (topic: string) => `Thiết kế cách triển khai ${topic} có cấu trúc, có khả năng kiểm thử và mở rộng.`,
      checkpoint: () => `Trình bày được kiến trúc hoặc quy trình giải pháp trước khi triển khai.`
    },
    {
      title: 'Triển khai chuyên sâu',
      objective: (topic: string) => `Xây dựng phần lõi của giải pháp với ${topic}, tập trung vào chất lượng và độ tin cậy.`,
      checkpoint: () => `Có phiên bản chạy được kèm cách kiểm tra lỗi chính.`
    },
    {
      title: goalFocus,
      objective: (_topic: string, goal: string) => `Tinh chỉnh, kiểm thử và đóng gói kết quả theo mục tiêu: ${clean(goal)}.`,
      checkpoint: () => `Sản phẩm cuối có tài liệu ngắn, demo được và có hướng phát triển tiếp.`
    }
  ]

  if (level === 'advanced') return advanced
  if (level === 'intermediate') return intermediate
  return beginner
}

function buildActivities(profile: LearnerProfile, index: number, totalWeeks: number): string[] {
  const topic = clean(profile.topic)
  const base = [
    `Học phần nội dung chính của tuần ${index + 1} về ${topic}`,
    `Ghi lại 3 ý quan trọng và 1 câu hỏi chưa rõ`,
    `Tự kiểm tra bằng quiz trước khi chuyển sang tuần tiếp theo`
  ]

  const progressActivity =
    index === totalWeeks - 1
      ? `Hoàn thiện sản phẩm/bài nộp gắn với mục tiêu: ${clean(profile.goal)}`
      : `Tạo một đầu ra nhỏ có thể dùng lại cho mục tiêu: ${clean(profile.goal)}`

  if (profile.learningStyle === 'practice') return [...base, 'Làm bài tập ngắn và tự sửa lỗi theo checkpoint', progressActivity]
  if (profile.learningStyle === 'project') return [...base, progressActivity, 'Ghi lại quyết định triển khai và phần cần cải thiện']
  if (profile.learningStyle === 'concepts') return [...base, 'Vẽ sơ đồ khái niệm và giải thích lại bằng ví dụ riêng', progressActivity]
  return [...base, 'Xem ví dụ mẫu rồi làm lại theo cách của bạn', progressActivity]
}

function buildQuiz(profile: LearnerProfile, phase: PlanPhase, index: number): string[] {
  return [
    `Tuần ${index + 1} giúp bạn tiến gần mục tiêu "${clean(profile.goal)}" như thế nào?`,
    `Khái niệm hoặc kỹ năng nào trong "${phase.title}" quan trọng nhất?`,
    `Bạn còn vướng phần nào cần AI tutor giải thích bằng ví dụ cụ thể?`
  ]
}

function detectGoalFocus(goal: string) {
  const normalized = goal.toLowerCase()
  if (normalized.includes('project') || normalized.includes('dự án') || normalized.includes('sản phẩm')) return 'Xây dựng mini project'
  if (normalized.includes('thi') || normalized.includes('chứng chỉ') || normalized.includes('exam')) return 'Ôn luyện theo dạng bài kiểm tra'
  if (normalized.includes('giao tiếp') || normalized.includes('phỏng vấn') || normalized.includes('interview')) return 'Luyện tình huống thực tế'
  return 'Áp dụng vào mục tiêu cá nhân'
}

function styleLabel(style: LearnerProfile['learningStyle']) {
  if (style === 'practice') return 'thực hành'
  if (style === 'project') return 'project'
  if (style === 'concepts') return 'khái niệm'
  return 'kết hợp'
}

function clean(value: string) {
  return value.trim() || 'chủ đề đã chọn'
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
