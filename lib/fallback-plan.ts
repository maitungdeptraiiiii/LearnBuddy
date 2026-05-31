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

type TopicProfile = {
  area: string
  complexity: number
  prerequisites: string[]
}

type PhaseTemplate = {
  title: string
  objective: (topic: string, goal: string) => string
  checkpoint: (topic: string, goal: string, week: number) => string
}

type LessonPacing = 'skim' | 'deep' | 'normal'

export function estimateRecommendedWeeks(profile: LearnerProfile) {
  const topicProfile = analyzeTopic(profile.topic)
  return recommendWeeks(profile, topicProfile)
}

export function generateFallbackPlan(profile: LearnerProfile): LearningPlan {
  const topicProfile = analyzeTopic(profile.topic)
  const recommendedWeeks = estimateRecommendedWeeks(profile)
  const selectedWeeks = Math.max(1, Math.min(12, profile.durationWeeks || recommendedWeeks))
  const durationAdvice = buildDurationAdvice(selectedWeeks, recommendedWeeks)
  const minutes = Math.max(45, Math.round(profile.hoursPerWeek * 60 * paceMultiplier[profile.pace]))
  const phases = buildPhases(profile, selectedWeeks, topicProfile)

  const lessons: Lesson[] = phases.map((phase, index) => ({
    id: `week-${index + 1}-${slugify(`${profile.topic}-${profile.goal}`).slice(0, 24)}`,
    week: index + 1,
    pacing: getLessonPacing(index, selectedWeeks, recommendedWeeks),
    title: phase.title,
    objective: phase.objective,
    durationMinutes: minutes,
    activities: buildActivities(profile, topicProfile, index, selectedWeeks, durationAdvice),
    checkpoint: phase.checkpoint,
    quiz: buildQuiz(profile, phase, index),
    status: 'todo'
  }))

  return {
    title: `Lộ trình học ${profile.topic} trong ${selectedWeeks} tuần`,
    summary: `Bạn chọn ${selectedWeeks} tuần. Số tuần phù hợp hệ thống gợi ý là ${recommendedWeeks} tuần cho ${levelLabel[profile.level] || profile.level}, với ${profile.hoursPerWeek} giờ/tuần và mục tiêu: ${profile.goal}. ${durationAdvice}`,
    prerequisites: topicProfile.prerequisites,
    recommendedWeeks,
    durationAdvice,
    profile: { ...profile, durationWeeks: selectedWeeks },
    lessons
  }
}

function getLessonPacing(index: number, selectedWeeks: number, recommendedWeeks: number): LessonPacing {
  if (selectedWeeks < recommendedWeeks) {
    if (index === 0 || index === selectedWeeks - 1) return 'deep'
    return index % 2 === 0 ? 'deep' : 'skim'
  }

  if (selectedWeeks > recommendedWeeks) {
    if (index === 0) return 'normal'
    return index >= Math.max(1, selectedWeeks - 2) || index % 2 === 0 ? 'deep' : 'normal'
  }

  return index === 0 || index === selectedWeeks - 1 ? 'deep' : 'normal'
}

function buildDurationAdvice(selectedWeeks: number, recommendedWeeks: number) {
  if (selectedWeeks < recommendedWeeks) {
    return `Vì thời lượng ngắn hơn gợi ý, nên học lướt các phần dễ/ít liên quan, ưu tiên nền tảng bắt buộc, phần khó và đầu ra cuối.`
  }

  if (selectedWeeks > recommendedWeeks) {
    return `Vì thời lượng dài hơn gợi ý, nên học kỹ hơn các phần khó, thêm bài thực hành, tự kiểm tra và mở rộng project.`
  }

  return `Thời lượng này phù hợp, có thể học đều từ nền tảng đến thực hành mà không cần rút gọn mạnh.`
}

function analyzeTopic(topic: string): TopicProfile {
  const normalized = topic.toLowerCase()

  if (includesAny(normalized, ['nlp', 'xử lý ngôn ngữ', 'language processing'])) {
    return {
      area: 'nlp',
      complexity: 4,
      prerequisites: ['Python cơ bản', 'Tư duy xử lý dữ liệu văn bản', 'Regex và thao tác chuỗi', 'Xác suất/thống kê cơ bản', 'Khái niệm machine learning cơ bản']
    }
  }

  if (includesAny(normalized, ['machine learning', 'ml', 'học máy', 'ai'])) {
    return {
      area: 'machine-learning',
      complexity: 4,
      prerequisites: ['Python cơ bản', 'Đại số tuyến tính cơ bản', 'Xác suất/thống kê cơ bản', 'Pandas/Numpy', 'Tư duy đánh giá mô hình']
    }
  }

  if (includesAny(normalized, ['data', 'phân tích dữ liệu', 'analyst', 'pandas'])) {
    return {
      area: 'data',
      complexity: 3,
      prerequisites: ['Python cơ bản', 'Kiểu dữ liệu và cấu trúc dữ liệu', 'Tư duy bảng dữ liệu', 'Thống kê mô tả cơ bản', 'Đọc biểu đồ và đặt câu hỏi dữ liệu']
    }
  }

  if (includesAny(normalized, ['web', 'react', 'next', 'frontend'])) {
    return {
      area: 'web',
      complexity: 3,
      prerequisites: ['HTML/CSS cơ bản', 'JavaScript cơ bản', 'DOM và event', 'HTTP request/response', 'Tư duy component']
    }
  }

  if (includesAny(normalized, ['backend', 'api', 'server', 'database'])) {
    return {
      area: 'backend',
      complexity: 3,
      prerequisites: ['Một ngôn ngữ lập trình cơ bản', 'HTTP và REST API', 'JSON', 'Cơ sở dữ liệu cơ bản', 'Debug và đọc log']
    }
  }

  if (includesAny(normalized, ['python'])) {
    return {
      area: 'programming',
      complexity: 2,
      prerequisites: ['Tư duy giải quyết vấn đề', 'Cài đặt môi trường lập trình', 'Biến và kiểu dữ liệu cơ bản', 'Điều kiện và vòng lặp', 'Cách chạy và debug chương trình']
    }
  }

  return {
    area: 'general',
    complexity: 2,
    prerequisites: ['Khái niệm nhập môn của chủ đề', 'Từ vựng/thuật ngữ cơ bản', 'Cách tìm tài liệu đáng tin cậy', 'Tư duy ghi chú và tự kiểm tra', 'Một mục tiêu thực hành nhỏ']
  }
}

function recommendWeeks(profile: LearnerProfile, topicProfile: TopicProfile) {
  const requestedWeeks = Math.max(1, Math.min(12, profile.durationWeeks || 1))
  const hours = Math.max(1, profile.hoursPerWeek || 1)
  const levelAdjustment = profile.level === 'beginner' ? 2 : profile.level === 'intermediate' ? 1 : 0
  const goalAdjustment = isAmbitiousGoal(profile.goal) ? 1 : 0
  const paceAdjustment = profile.pace === 'gentle' ? 1 : profile.pace === 'intensive' ? -1 : 0
  const hoursAdjustment = hours < 4 ? 2 : hours < 7 ? 1 : hours >= 12 ? -1 : 0
  const recommended = topicProfile.complexity + levelAdjustment + goalAdjustment + paceAdjustment + hoursAdjustment

  return Math.max(requestedWeeks, Math.min(12, Math.max(2, recommended)))
}

function buildPhases(profile: LearnerProfile, totalWeeks: number, topicProfile: TopicProfile): PlanPhase[] {
  const topic = clean(profile.topic)
  const goalFocus = detectGoalFocus(profile.goal)
  const middleStages = phaseSequence(profile.level, goalFocus, topicProfile.area)

  return Array.from({ length: totalWeeks }, (_, index) => {
    const ratio = totalWeeks === 1 ? 1 : index / (totalWeeks - 1)

    if (index === 0) {
      return {
        title: `Kiến thức nền tảng cần có: ${topic}`,
        objective: `Rà soát các nền tảng bắt buộc trước khi học ${topic}: ${topicProfile.prerequisites.join(', ')}.`,
        checkpoint: `Tự đánh giá được nền tảng nào đã ổn, nền tảng nào còn thiếu và cần ôn trước khi đi tiếp.`
      }
    }

    if (ratio >= 0.8) {
      return {
        title: `Hoàn thiện sản phẩm cuối: ${topic}`,
        objective: `Tổng hợp kiến thức đã học để hoàn thành mục tiêu "${clean(profile.goal)}" bằng một sản phẩm hoặc bài thực hành có thể trình bày.`,
        checkpoint: `Có một kết quả cuối rõ ràng, giải thích được cách làm và các phần cần cải thiện tiếp theo.`
      }
    }

    const stage = middleStages[Math.min(index - 1, middleStages.length - 1)]
    return {
      title: `${stage.title}: ${topic}`,
      objective: stage.objective(topic, profile.goal),
      checkpoint: stage.checkpoint(topic, profile.goal, index + 1)
    }
  })
}

function phaseSequence(level: string, goalFocus: string, area: string): PhaseTemplate[] {
  const domainPractice = area === 'nlp' ? 'Tiền xử lý, biểu diễn văn bản và đánh giá kết quả' : area === 'data' ? 'Làm sạch, phân tích và trực quan hóa dữ liệu' : 'Bài tập ứng dụng theo chủ đề'

  if (level === 'advanced') {
    return [
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
        title: goalFocus,
        objective: (_topic: string, goal: string) => `Tinh chỉnh, kiểm thử và đóng gói kết quả theo mục tiêu: ${clean(goal)}.`,
        checkpoint: () => `Sản phẩm cuối có tài liệu ngắn, demo được và có hướng phát triển tiếp.`
      }
    ]
  }

  if (level === 'intermediate') {
    return [
      {
        title: 'Rà soát nền tảng và lấp lỗ hổng',
        objective: (topic: string) => `Ôn nhanh ${topic}, xác định phần còn yếu và chuẩn hóa cách thực hành.`,
        checkpoint: (topic: string) => `Tự đánh giá được 3 điểm mạnh/yếu khi học ${topic}.`
      },
      {
        title: domainPractice,
        objective: (topic: string) => `Dùng ${topic} để giải quyết bài toán gần với mục tiêu học, có tiêu chí đánh giá rõ ràng.`,
        checkpoint: () => `Hoàn thành một bài ứng dụng có đầu vào, đầu ra và tiêu chí kiểm tra.`
      },
      {
        title: goalFocus,
        objective: (_topic: string, goal: string) => `Hoàn thiện sản phẩm/bài tập phục vụ mục tiêu: ${clean(goal)}.`,
        checkpoint: () => `Có kết quả cuối có thể demo hoặc nộp lại.`
      }
    ]
  }

  return [
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
      title: domainPractice,
      objective: (topic: string) => `Áp dụng ${topic} vào bài tập ngắn, nhận diện lỗi phổ biến và sửa theo checkpoint.`,
      checkpoint: () => `Hoàn thành bài thực hành, ghi lại lỗi gặp phải và cách sửa.`
    },
    {
      title: goalFocus,
      objective: (_topic: string, goal: string) => `Biến kiến thức đã học thành bước đầu của mục tiêu: ${clean(goal)}.`,
      checkpoint: () => `Có bản nháp đầu tiên và biết phần nào cần bổ sung ở tuần tiếp theo.`
    }
  ]
}

function buildActivities(profile: LearnerProfile, topicProfile: TopicProfile, index: number, totalWeeks: number, durationAdvice: string): string[] {
  const topic = clean(profile.topic)
  const base =
    index === 0
      ? [`Đánh dấu nền tảng đã biết: ${topicProfile.prerequisites.join(', ')}`, 'Chọn 1-2 phần yếu nhất để ôn trước', 'Hỏi tutor nếu chưa rõ nên ôn phần nào trước']
      : [`Học phần nội dung chính của tuần ${index + 1} về ${topic}`, `Ghi lại 3 ý quan trọng và 1 câu hỏi chưa rõ`, `Tự kiểm tra bằng quiz trước khi chuyển sang tuần tiếp theo`]

  const progressActivity =
    index === totalWeeks - 1
      ? `Hoàn thiện sản phẩm/bài nộp gắn với mục tiêu: ${clean(profile.goal)}`
      : `Tạo một đầu ra nhỏ có thể dùng lại cho mục tiêu: ${clean(profile.goal)}`

  const pacingActivity = durationAdvice.includes('ngắn hơn') ? 'Đánh dấu phần có thể học lướt và phần bắt buộc phải hiểu sâu' : 'Chọn một phần khó để đào sâu thêm bằng ví dụ hoặc bài tập mở rộng'

  if (profile.learningStyle === 'practice') return [...base, 'Làm bài tập ngắn và tự sửa lỗi theo checkpoint', pacingActivity, progressActivity]
  if (profile.learningStyle === 'project') return [...base, pacingActivity, progressActivity, 'Ghi lại quyết định triển khai và phần cần cải thiện']
  if (profile.learningStyle === 'concepts') return [...base, 'Vẽ sơ đồ khái niệm và giải thích lại bằng ví dụ riêng', pacingActivity, progressActivity]
  return [...base, 'Xem ví dụ mẫu rồi làm lại theo cách của bạn', pacingActivity, progressActivity]
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
  if (includesAny(normalized, ['project', 'dự án', 'sản phẩm'])) return 'Xây dựng mini project'
  if (includesAny(normalized, ['thi', 'chứng chỉ', 'exam'])) return 'Ôn luyện theo dạng bài kiểm tra'
  if (includesAny(normalized, ['giao tiếp', 'phỏng vấn', 'interview'])) return 'Luyện tình huống thực tế'
  return 'Áp dụng vào mục tiêu cá nhân'
}

function isAmbitiousGoal(goal: string) {
  return includesAny(goal.toLowerCase(), ['project', 'dự án', 'sản phẩm', 'phỏng vấn', 'interview', 'chứng chỉ', 'portfolio'])
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword))
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
