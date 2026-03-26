"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import DashboardLayout from "../dashboard/layout";

interface BlogPost {
  id: string;
  title: string;
  feature_image: string | null;
  excerpt: string;
  url: string;
}

function getResizedImage(url: string | null, width: number = 600): string | null {
  if (!url) return null;
  // Ghost CDN supports /size/w{width}/ for on-the-fly resizing
  return url.replace(
    "/content/images/",
    `/content/images/size/w${width}/`
  );
}

const HomePage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const key = process.env.NEXT_PUBLIC_GHOST_BLOG_KEY;

  useEffect(() => {
    axios
      .get(
        `https://blogs.qodeinvest.com/ghost/api/content/posts/?key=${key}&filter=tag:hash-blog-quicktakes&limit=all&fields=id,title,feature_image,excerpt,url`
      )
      .then((response) => {
        setPosts(response.data.posts);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [key]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? posts.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === posts.length - 1 ? 0 : prev + 1));
  };

  const currentPost = posts[currentIndex];
  const prevIndex = currentIndex === 0 ? posts.length - 1 : currentIndex - 1;
  const nextIndex = currentIndex === posts.length - 1 ? 0 : currentIndex + 1;

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center px-4 sm:px-8 md:px-12 pt-16 pb-12">
        <div className="w-full max-w-5xl space-y-16">
          {/* Title: Our Core */}
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-serif text-card-text">
              Our <em className="text-button-text">Core</em>
            </h1>
            <div className="mt-3 mx-auto w-12 h-[3px] bg-button-text rounded" />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-12 md:gap-16">
            {/* Left column */}
            <div className="space-y-8">
              <div className="flex items-center gap-2">
                <span className="block w-1.5 h-1.5 rounded-full bg-button-text shrink-0" />
                <h2 className="text-2xl md:text-3xl font-bold font-serif text-card-text">
                  Brand Narrative
                </h2>
              </div>

              <p className="text-xl md:text-2xl font-serif text-card-text leading-relaxed">
                At Qode, while practicing the future of investing, we&apos;re
                enabling the{" "}
                <em className="text-button-text">
                  Code of Wealth Generation.
                </em>
              </p>
            </div>

            {/* Right column */}
            <div className="space-y-6 text-card-text-secondary leading-relaxed">
              <p>
                In a world where investment decisions are often shaped by
                intuition, instinct, and speculation, we follow a more thoughtful
                and structured approach, where technology is a powerful enabler
                that enhances decision-making, but human expertise remains at the
                core.
              </p>
              <p>
                As a quant-focused asset management firm, we apply knowledge,
                curiosity, and analytical depth to uncover the underlying forces
                shaping markets, helping investors navigate complexity with
                confidence.
              </p>
              <p>
                Rooted in transparency, discipline, and deep research, our
                strategies are optimised, resilient, and calibrated — ensuring
                rationality prevails over panic, and long-term wealth is built
                with clarity and conviction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Blog Carousel */}
      {!loading && posts.length > 0 && currentPost && (
        <div className="px-4 sm:px-8 md:px-12 pt-8 pb-16">
          <div className="max-w-5xl mx-auto">
            <div className="bg-[#E8E5CC] rounded-2xl p-6 md:p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                {/* Left: Feature Image */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {currentPost.feature_image ? (
                    <img
                      key={currentPost.id}
                      src={getResizedImage(currentPost.feature_image)!}
                      alt={currentPost.title}
                      className="w-full h-auto object-cover"
                      loading="eager"
                    />
                  ) : (
                    <div className="w-full h-64 flex items-center justify-center bg-gray-100">
                      <span className="text-2xl font-serif text-card-text-secondary">
                        Qode
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Content */}
                <div className="space-y-5">
                  {/* Navigation */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handlePrev}
                      className="w-9 h-9 flex items-center justify-center rounded border border-card-text-secondary text-card-text-secondary hover:bg-white/50 transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <button
                      onClick={handleNext}
                      className="w-9 h-9 flex items-center justify-center rounded border border-card-text-secondary text-card-text-secondary hover:bg-white/50 transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    <span className="text-sm text-card-text-secondary">
                      {currentIndex + 1} of {posts.length}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-xl md:text-2xl font-serif text-card-text leading-snug">
                    {currentPost.title}
                  </h3>

                  {/* Excerpt */}
                  <p className="text-sm md:text-base text-card-text-secondary leading-relaxed line-clamp-4">
                    {currentPost.excerpt}
                  </p>

                  {/* Know More Button */}
                  <a
                    href={currentPost.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-logo-green text-white text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
                  >
                    Know More
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Preload adjacent slide images */}
          {posts[prevIndex]?.feature_image && (
            <link
              rel="prefetch"
              href={getResizedImage(posts[prevIndex].feature_image)!}
              as="image"
            />
          )}
          {posts[nextIndex]?.feature_image && (
            <link
              rel="prefetch"
              href={getResizedImage(posts[nextIndex].feature_image)!}
              as="image"
            />
          )}
        </div>
      )}
    </DashboardLayout>
  );
};

export default HomePage;
