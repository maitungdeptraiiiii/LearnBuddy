import { NextResponse } from 'next/server'
import { enrichRecommendedResourceLinks } from '@/lib/recommended-resource-links'
import type { LearningPlan } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { plan?: LearningPlan }
    const plan = body.plan
    if (!plan || !plan.profile || !Array.isArray(plan.lessons)) {
      return NextResponse.json({ error: 'Thiếu dữ liệu lộ trình để gợi ý link.' }, { status: 400 })
    }

    const lessons = await enrichRecommendedResourceLinks(plan.lessons, plan.profile, { refreshExisting: true })
    return NextResponse.json({ lessons })
  } catch {
    return NextResponse.json({ error: 'Không thể gợi ý link tài liệu lúc này.' }, { status: 500 })
  }
}