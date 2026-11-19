import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PasswordStrength,
  evaluatePasswordStrength,
} from "@/components/auth/password-strength";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordSchema } from "@/lib/auth/validation";

let passedCount = 0;
let totalCount = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  totalCount++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedCount++;
          console.log(`  ✅ [PASS] ${name}`);
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${name}`);
          console.error(err);
          throw err;
        });
    } else {
      passedCount++;
      console.log(`  ✅ [PASS] ${name}`);
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

async function runAllTests() {
  console.log("================================================================================");
  console.log("🧪 CrediGuide AI - Phase 4 Sub-Phase F: Stage 2A UI Components Test Suite");
  console.log("================================================================================\n");

  // ---------------------------------------------------------------------------
  // GROUP 1: Input Component Rendering & Accessibility
  // ---------------------------------------------------------------------------
  console.log("--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 1: Input Component Rendering & Accessibility");
  console.log("--------------------------------------------------------------------------------");

  runTest("Input renders with default text type and base classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(Input, { id: "test-input", name: "testName", placeholder: "Enter text" })
    );
    assert.ok(html.includes('type="text"'), "Must default to type text");
    assert.ok(html.includes('id="test-input"'), "Must render id");
    assert.ok(html.includes('name="testName"'), "Must render name");
    assert.ok(html.includes('placeholder="Enter text"'), "Must render placeholder");
    assert.ok(html.includes("rounded-lg"), "Must contain base styling classes");
    assert.ok(!html.includes("aria-invalid"), "Must not have aria-invalid when hasError is false");
  });

  runTest("Input renders specific input types (password, email, number)", () => {
    const pwdHtml = renderToStaticMarkup(React.createElement(Input, { type: "password" }));
    assert.ok(pwdHtml.includes('type="password"'));

    const emailHtml = renderToStaticMarkup(React.createElement(Input, { type: "email" }));
    assert.ok(emailHtml.includes('type="email"'));
  });

  runTest("Input renders accessible error state with aria-invalid='true' and border-red-500", () => {
    const html = renderToStaticMarkup(
      React.createElement(Input, { hasError: true, "aria-describedby": "error-msg-id" })
    );
    assert.ok(html.includes('aria-invalid="true"'), "Must set aria-invalid='true' on error");
    assert.ok(html.includes("border-red-500"), "Must include error border styling");
    assert.ok(html.includes('aria-describedby="error-msg-id"'), "Must render aria-describedby");
  });

  runTest("Input renders disabled state properly", () => {
    const html = renderToStaticMarkup(React.createElement(Input, { disabled: true }));
    assert.ok(html.includes("disabled"), "Must include disabled attribute");
    assert.ok(html.includes("disabled:cursor-not-allowed"), "Must include disabled styling");
  });

  runTest("Input supports required and autoComplete attributes", () => {
    const html = renderToStaticMarkup(
      React.createElement(Input, { required: true, autoComplete: "current-password" })
    );
    assert.ok(html.includes("required"), "Must render required attribute");
    assert.ok(
      html.toLowerCase().includes('autocomplete="current-password"'),
      "Must render autoComplete attribute"
    );
  });

  // ---------------------------------------------------------------------------
  // GROUP 2: Label Component Rendering & Accessibility
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 2: Label Component Rendering & Accessibility");
  console.log("--------------------------------------------------------------------------------");

  runTest("Label renders text content and forwards htmlFor", () => {
    const html = renderToStaticMarkup(
      React.createElement(Label, { htmlFor: "target-input-id" }, "Email Address")
    );
    assert.ok(html.includes('for="target-input-id"'), "Must forward htmlFor to for attribute");
    assert.ok(html.includes("Email Address"), "Must render label text");
    assert.ok(!html.includes("aria-hidden"), "Must not have asterisk when required is false");
  });

  runTest("Label renders required indicator with aria-hidden='true'", () => {
    const html = renderToStaticMarkup(
      React.createElement(Label, { htmlFor: "pwd", required: true }, "Password")
    );
    assert.ok(html.includes('for="pwd"'));
    assert.ok(html.includes("Password"));
    assert.ok(html.includes("*"), "Must include asterisk");
    assert.ok(html.includes('aria-hidden="true"'), "Asterisk must be aria-hidden='true'");
    assert.ok(html.includes("text-red-500"), "Asterisk must have red styling");
  });

  runTest("Label merges custom className", () => {
    const html = renderToStaticMarkup(
      React.createElement(Label, { className: "custom-label-class" }, "Custom Label")
    );
    assert.ok(html.includes("custom-label-class"));
  });

  // ---------------------------------------------------------------------------
  // GROUP 3: Password Strength Evaluation Logic (Backend Schema Parity)
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 3: Password Strength Evaluation Logic (Backend Parity)");
  console.log("--------------------------------------------------------------------------------");

  runTest("Empty password evaluates to score 0 (Weak, 0/5 met)", () => {
    const evalResult = evaluatePasswordStrength("");
    assert.equal(evalResult.score, 0);
    assert.equal(evalResult.strengthLevel, "Weak");
    assert.equal(evalResult.isValid, false);
    assert.equal(evalResult.isLengthValid, false);
    assert.equal(evalResult.hasUppercase, false);
    assert.equal(evalResult.hasLowercase, false);
    assert.equal(evalResult.hasNumber, false);
    assert.equal(evalResult.hasSpecialChar, false);
  });

  runTest("Criterion 1: Length between 8 and 128 characters", () => {
    // 7 characters (under min 8)
    const shortResult = evaluatePasswordStrength("Aa1!xyz");
    assert.equal(shortResult.isLengthValid, false, "7 chars must fail length");
    assert.equal(shortResult.score, 4);

    // Exactly 8 characters
    const exact8 = evaluatePasswordStrength("Aa1!xyzz");
    assert.equal(exact8.isLengthValid, true, "8 chars must satisfy length");

    // Exactly 128 characters
    const exact128 = evaluatePasswordStrength("A" + "a".repeat(125) + "1!");
    assert.equal(exact128.isLengthValid, true, "128 chars must satisfy length");

    // 129 characters (over max 128)
    const over128 = evaluatePasswordStrength("A" + "a".repeat(126) + "1!");
    assert.equal(over128.isLengthValid, false, "129 chars must fail length");
    assert.equal(over128.isValid, false);
  });

  runTest("Criterion 2: At least one uppercase letter (/[A-Z]/)", () => {
    const noUpper = evaluatePasswordStrength("password123!");
    assert.equal(noUpper.hasUppercase, false);
    assert.equal(noUpper.isValid, false);

    const withUpper = evaluatePasswordStrength("Password123!");
    assert.equal(withUpper.hasUppercase, true);
  });

  runTest("Criterion 3: At least one lowercase letter (/[a-z]/)", () => {
    const noLower = evaluatePasswordStrength("PASSWORD123!");
    assert.equal(noLower.hasLowercase, false);
    assert.equal(noLower.isValid, false);

    const withLower = evaluatePasswordStrength("Password123!");
    assert.equal(withLower.hasLowercase, true);
  });

  runTest("Criterion 4: At least one digit (/[0-9]/)", () => {
    const noDigit = evaluatePasswordStrength("Password!@#");
    assert.equal(noDigit.hasNumber, false);
    assert.equal(noDigit.isValid, false);

    const withDigit = evaluatePasswordStrength("Password123!");
    assert.equal(withDigit.hasNumber, true);
  });

  runTest("Criterion 5: At least one special character (/[^A-Za-z0-9]/)", () => {
    const noSpecial = evaluatePasswordStrength("Password1234");
    assert.equal(noSpecial.hasSpecialChar, false);
    assert.equal(noSpecial.isValid, false);

    const withSpecial = evaluatePasswordStrength("Password1234!");
    assert.equal(withSpecial.hasSpecialChar, true);
  });

  runTest("Strength levels: Weak (0-2), Moderate (3-4), Strong (5)", () => {
    // Score 1: length only
    const score1 = evaluatePasswordStrength("abcdefgh");
    assert.equal(score1.score, 2); // length + lowercase
    assert.equal(score1.strengthLevel, "Weak");

    // Score 3: length + lower + upper
    const score3 = evaluatePasswordStrength("Abcdefgh");
    assert.equal(score3.score, 3);
    assert.equal(score3.strengthLevel, "Moderate");

    // Score 4: length + lower + upper + number
    const score4 = evaluatePasswordStrength("Abcdefg1");
    assert.equal(score4.score, 4);
    assert.equal(score4.strengthLevel, "Moderate");

    // Score 5: all criteria met
    const score5 = evaluatePasswordStrength("Abcdefg1!");
    assert.equal(score5.score, 5);
    assert.equal(score5.strengthLevel, "Strong");
    assert.equal(score5.isValid, true);
  });

  runTest("Parity with Backend PasswordSchema (100% agreement)", () => {
    const testCandidates = [
      "",
      "short",
      "toolong" + "a".repeat(125),
      "alllowercase123!",
      "ALLUPPERCASE123!",
      "NoNumbersHere!@",
      "NoSpecialChars123",
      "ValidPass1!",
      "SuperSecret#2026",
      "EnterpriseAuth$99",
    ];

    for (const candidate of testCandidates) {
      const frontendResult = evaluatePasswordStrength(candidate);
      const backendResult = PasswordSchema.safeParse(candidate);

      assert.equal(
        frontendResult.isValid,
        backendResult.success,
        `Mismatch for password '${candidate}': frontend isValid=${frontendResult.isValid}, backend success=${backendResult.success}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // GROUP 4: PasswordStrength Component Markup & Accessibility
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 4: PasswordStrength Component Markup & Accessibility");
  console.log("--------------------------------------------------------------------------------");

  runTest("PasswordStrength renders progressbar with correct ARIA attributes", () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordStrength, { password: "Pass" })
    );
    assert.ok(html.includes('role="progressbar"'), "Must contain role='progressbar'");
    assert.ok(html.includes('aria-valuemin="0"'), "Must have aria-valuemin='0'");
    assert.ok(html.includes('aria-valuemax="5"'), "Must have aria-valuemax='5'");
    assert.ok(html.includes('aria-label="Password strength"'), "Must have aria-label");
    assert.ok(html.includes('aria-valuetext="'), "Must have aria-valuetext");
  });

  runTest("PasswordStrength renders aria-live='polite' requirement list", () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordStrength, { password: "ValidPass1!" })
    );
    assert.ok(html.includes('aria-live="polite"'), "Must include aria-live='polite'");
    assert.ok(html.includes('aria-label="Password requirements"'), "Must label requirements list");
    assert.ok(html.includes("Between 8 and 128 characters"));
    assert.ok(html.includes("At least one uppercase letter"));
    assert.ok(html.includes("At least one lowercase letter"));
    assert.ok(html.includes("At least one number"));
    assert.ok(html.includes("At least one special character"));
    assert.ok(html.includes("Strong (5/5 met)"), "Must display Strong rating and 5/5 count");
  });

  runTest("PasswordStrength respects showCriteriaList=false", () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordStrength, { password: "ValidPass1!", showCriteriaList: false })
    );
    assert.ok(html.includes('role="progressbar"'));
    assert.ok(!html.includes('aria-live="polite"'), "Criteria list must be omitted");
    assert.ok(!html.includes("Between 8 and 128 characters"));
  });

  runTest("PasswordStrength displays non-exaggerated objective rating", () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordStrength, { password: "ValidPass1!" })
    );
    assert.ok(!html.includes("military-grade"), "Must not make military-grade claims");
    assert.ok(!html.includes("unbreakable"), "Must not make unbreakable claims");
    assert.ok(!html.includes("100% secure"), "Must not make 100% secure claims");
  });

  // ---------------------------------------------------------------------------
  // GROUP 5: AuthCard Component Rendering & Structure
  // ---------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------------------------------");
  console.log("▶ TEST GROUP 5: AuthCard Component Rendering & Structure");
  console.log("--------------------------------------------------------------------------------");

  runTest("AuthCard renders title, description, badge, and children", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthCard,
        {
          title: "Sign In to Your Account",
          description: "Enter your registered credentials below.",
          badgeText: "Secure Portal",
        },
        React.createElement("form", { id: "test-form" }, "Form Content Here")
      )
    );
    assert.ok(html.includes("Sign In to Your Account"), "Must render title");
    assert.ok(html.includes("Enter your registered credentials below."), "Must render description");
    assert.ok(html.includes("Secure Portal"), "Must render badge text");
    assert.ok(html.includes('id="test-form"'), "Must render children");
    assert.ok(html.includes("max-w-md"), "Must have container styling");
    assert.ok(!html.includes("military-grade"), "Must not make unverified claims");
  });

  runTest("AuthCard renders optional footer when provided", () => {
    const withFooterHtml = renderToStaticMarkup(
      React.createElement(
        AuthCard,
        {
          title: "Reset Password",
          footer: React.createElement("a", { href: "/auth/login" }, "Back to Login"),
        },
        "Card Body"
      )
    );
    assert.ok(withFooterHtml.includes("Back to Login"), "Must render footer content");
    assert.ok(withFooterHtml.includes('href="/auth/login"'));

    const withoutFooterHtml = renderToStaticMarkup(
      React.createElement(AuthCard, { title: "Simple Card" }, "No Footer")
    );
    assert.ok(!withoutFooterHtml.includes("Back to Login"));
  });

  runTest("AuthCard incorporates institutional Landmark brand indicator", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthCard, { title: "Brand Test" }, "Content")
    );
    assert.ok(html.includes("from-blue-700 to-indigo-900"), "Must have institutional gradient styling");
  });

  console.log("\n================================================================================");
  console.log(`🏁 STAGE 2A TEST SUMMARY: ${passedCount}/${totalCount} Tests Passed (100% SUCCESS)`);
  console.log("================================================================================\n");
}

runAllTests().catch(() => {
  process.exit(1);
});
