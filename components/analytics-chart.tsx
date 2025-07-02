"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function AnalyticsChart() {
  return (
    <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
      <CardHeader>
        <CardTitle className="text-card-text font-heading">Weekly Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-end justify-between space-x-2">
          {[40, 60, 45, 80, 65, 90, 75].map((height, index) => (
            <div
              key={index}
              className="bg-logo-green/80 rounded-t flex-1 transition-all hover:bg-logo-green"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-4 text-sm text-card-text-secondary">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>
      </CardContent>
    </Card>
  )
}
