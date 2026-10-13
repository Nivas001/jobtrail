"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = ["#f59e0b", "#60a5fa", "#a78bfa", "#34d399", "#fb7185", "#22d3ee", "#f472b6"];

function domainOf(url: string | null | undefined) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Job boards host many companies; their favicon would be misleading.
    if (/(linkedin|indeed|naukri|glassdoor|lever|greenhouse|workday|wellfound|instahyre|foundit|ashbyhq|myworkdayjobs)\./.test(host)) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

export function CompanyLogo({
  company,
  url,
  size = 36,
  className,
}: {
  company: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const domain = domainOf(url);
  const [failed, setFailed] = useState(false);
  const initials = company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const color = PALETTE[[...company].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

  return (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[28%] border font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        color,
        backgroundColor: `${color}18`,
        borderColor: `${color}30`,
      }}
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          className="size-full bg-white object-contain p-[14%]"
          onError={() => setFailed(true)}
        />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
