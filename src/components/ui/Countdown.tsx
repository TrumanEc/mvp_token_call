'use client'

import { useState, useEffect } from 'react'

interface Props {
  date: string | Date
  className?: string
}

function calc(target: Date) {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return { d, h, m, s, diff }
}

export function Countdown({ date, className = '' }: Props) {
  const target = new Date(date)
  const [time, setTime] = useState(() => calc(target))

  useEffect(() => {
    // update every second only when < 1 day, else every minute
    const interval = time && time.d < 1 ? 1000 : 60000
    const id = setInterval(() => setTime(calc(target)), interval)
    return () => clearInterval(id)
  }, [date])

  if (!time) return <span className={className}>Cerrado</span>

  if (time.d >= 30) {
    return <span className={className}>{time.d}d</span>
  }

  if (time.d >= 1) {
    return (
      <span className={className}>
        {time.d}d {time.h}h
      </span>
    )
  }

  if (time.h >= 1) {
    return (
      <span className={className}>
        {time.h}h {time.m}m
      </span>
    )
  }

  return (
    <span className={className}>
      {time.m}m {time.s}s
    </span>
  )
}
