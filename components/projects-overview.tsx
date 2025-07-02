import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const projects = [
  {
    name: "Website Redesign",
    client: "Acme Corp",
    status: "In Progress",
    progress: 75,
  },
  {
    name: "Mobile App",
    client: "Tech Startup",
    status: "Review",
    progress: 90,
  },
  {
    name: "Brand Identity",
    client: "Local Business",
    status: "Planning",
    progress: 25,
  },
  {
    name: "E-commerce Site",
    client: "Retail Store",
    status: "Completed",
    progress: 100,
  },
]

export function ProjectsOverview() {
  return (
    <Card className="bg-white/70 backdrop-blur-sm card-shadow border-0">
      <CardHeader>
        <CardTitle className="text-card-text font-heading">Recent Projects</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {projects.map((project, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-card-text">{project.name}</h4>
                <p className="text-sm text-card-text-secondary">{project.client}</p>
                <div className="mt-2 w-full bg-primary-bg rounded-full h-2">
                  <div
                    className="bg-logo-green h-2 rounded-full transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>
              <Badge
                variant={
                  project.status === "Completed"
                    ? "default"
                    : project.status === "In Progress"
                      ? "secondary"
                      : "outline"
                }
                className="ml-4"
              >
                {project.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
