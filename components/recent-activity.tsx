import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const activities = [
  {
    id: 1,
    type: "project",
    message: "New project 'Website Redesign' created",
    time: "2 hours ago",
    user: "John Doe",
  },
  {
    id: 2,
    type: "payment",
    message: "Payment received from Acme Corp",
    time: "4 hours ago",
    user: "System",
  },
  {
    id: 3,
    type: "client",
    message: "New client 'Tech Startup' added",
    time: "1 day ago",
    user: "Jane Smith",
  },
  {
    id: 4,
    type: "task",
    message: "Task 'Design mockups' completed",
    time: "2 days ago",
    user: "Mike Johnson",
  },
]

export function RecentActivity() {
  return (
    <Card className="bg-white/50 backdrop-blur-sm card-shadow border-0">
      <CardHeader>
        <CardTitle className="text-card-text font-heading">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-logo-green flex items-center justify-center">
                  <span className="text-xs font-medium text-button-text">{activity.user.charAt(0)}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-card-text">{activity.message}</p>
                <p className="text-xs text-card-text-secondary">
                  {activity.time} • {activity.user}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
