"use client";

import React, { Suspense } from "react";
import {
  VerifyEmailContent,
  VerifyEmailLoadingFallback,
} from "@/components/auth/verify-email-view";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<VerifyEmailLoadingFallback />}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
