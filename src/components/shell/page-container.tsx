import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-10 sm:px-6 sm:pb-12 lg:px-8">
      {children}
    </div>
  );
}
