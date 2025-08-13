"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import Head from "next/head";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import DashboardLayout from "../dashboard/layout";
const HomePage = () => {
  const [blog, setBlog] = useState([]);
  const [loading, setLoading] = useState(true);
  // IMPORTANT: For client-side env variables in Next.js, prefix with NEXT_PUBLIC_
  const key = process.env.NEXT_PUBLIC_GHOST_BLOG_KEY;
  const url = `https://blogs.qodeinvest.com/ghost/api/content/posts/?key=${key}&filter=tag:qode-dashboard`;

  useEffect(() => {
    axios
      .get(url)
      .then((response) => {
        setBlog(response.data.posts);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [key]);

  return (
    <>
      <Head>
        <title>Qode Blogs - Insights on Data-Driven Investing</title>
        <meta
          name="description"
          content="Read the latest blogs and insights from Qode on data-driven investment strategies, market analysis, and wealth management tips."
        />
        <meta
          name="keywords"
          content="Qode blogs, investment strategies, wealth management, market analysis, data-driven investing"
        />
        <meta name="author" content="Qode" />
        <link rel="canonical" href="https://www.qodeinvest.com/blogs" />
      </Head>
      <DashboardLayout>
        <div className="sm:p-2 space-y-6">
          <h1 className="text-3xl font-semibold text-card-text-secondary font-heading">Home</h1>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <a
              href="https://qodeinvest.com"
              target="_blank"
              rel="noreferrer noopener"
              className="bg-white/50  card-shadow border-0 rounded-lg cursor-pointer"
            >
              <Card className="bg-white/50 card-shadow border-none">
                <CardHeader>
                  <CardTitle className="text-card-text text-sm sm:text-lg flex items-center justify-between">
                    Visit website
                    <svg
                      stroke="currentColor"
                      fill="currentColor"
                      strokeWidth="0"
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-gray-400 ml-2"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"
                      ></path>
                    </svg>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Keep up with our latest content on our website
                  </p>
                </CardContent>
              </Card>
            </a>
          </div>

          <h2 className="text-xl font-semibold text-card-text font-heading-bold">Latest Posts</h2>
          {loading ? (
            <div className="flex justify-center items-center h-40 text-gray-900 dark:text-gray-100">
              Loading...
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {blog.map((post) => {
                // Format the published date if available
                const publishedDate = post.published_at
                  ? new Date(post.published_at).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "Unknown Date";
                return (
                  <Card
                    key={post.id}
                    className="bg-white/50 backdrop-blur-sm card-shadow border-0 cursor-pointer"
                    onClick={() => (window.location.href = `https://www.qodeinvest.com/blogs/${post.slug}`)}
                  >
                    <CardContent className="p-4">
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{publishedDate}</p>
                      <h3 className="text-xl font-semibold text-card-text font-heading-bold mb-2">{post.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{post.excerpt}</p>
                      <p className="text-sm font-semibold text-button-text my-2">Read More</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
};

export default HomePage;