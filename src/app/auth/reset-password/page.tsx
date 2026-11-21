"use client";

import React, { Suspense } from "react";
import {
  ResetPasswordForm,
  ResetPasswordLoadingFallback,
} from "@/components/auth/reset-password-view";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<ResetPasswordLoadingFallback />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
