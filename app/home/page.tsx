"use client";

import React from "react";
import DashboardLayout from "../dashboard/layout";

const HomePage = () => {
  return (
    <DashboardLayout>
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-120px)] px-4 sm:px-8 md:px-12 py-12">
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
              <em className="text-button-text">Code of Wealth Generation.</em>
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
              rationality prevails over panic, and long-term wealth is built with
              clarity and conviction.
            </p>
          </div>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default HomePage;
