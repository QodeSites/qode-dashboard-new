"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import Header from "@/components/header";

// Define the props interface for DashboardLayout
interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Define the component as a React Functional Component
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-primary-bg">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="lg:pl-64">
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="p-6">
          <div className="max-w-8xl mx-auto">{children}</div>
        </main> 
      </div>
    </div>
  );
};

export default DashboardLayout;