import Link from "next/link";
import { BrandMark } from "@/components/icons";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          href="/episodes"
          className="group flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background transition-transform duration-300 group-hover:-rotate-3">
            <BrandMark className="size-4" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-[-0.02em]">
              Workflow Studio
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Production desk
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          <Link
            href="/episodes"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Episode
          </Link>
          <span className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:inline-flex">
            <span className="animate-soft-pulse size-1.5 rounded-full bg-primary" />
            Local only
          </span>
        </nav>
      </div>
    </header>
  );
}
