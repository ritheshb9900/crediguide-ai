"use client";

import React, { Suspense } from "react";
import { LoginForm, LoginLoadingFallback } from "@/components/auth/login-view";

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<LoginLoadingFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
