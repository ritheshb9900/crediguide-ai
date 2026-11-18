import { z } from "zod";

/**
 * Reusable password complexity schema:
 * - Minimum 8 characters, maximum 128 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one numerical digit
 * - At least one special symbol
 */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.")
  .max(128, "Password must not exceed 128 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character.");

/**
 * Normalized email schema:
 * - Trims whitespace
 * - Normalizes to lowercase
 * - Verifies valid RFC 5322 format
 */
export const NormalizedEmailSchema = z
  .string()
  .trim()
  .min(1, "Email address is required.")
  .email("Invalid email address format.")
  .transform((val) => val.toLowerCase());

/**
 * Optional 10-digit Indian mobile number:
 * - Starts with 6, 7, 8, or 9
 * - Followed by 9 digits
 */
export const OptionalIndianPhoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Phone number must be a valid 10-digit Indian mobile number.")
  .optional()
  .or(z.literal(""));

/**
 * Public Applicant Registration Schema.
 *
 * CRITICAL SECURITY SAFEGUARD:
 * - Omits the `role` field completely.
 * - Any attempt by a client to submit `role: "BANK_ADMIN"` or `role: "BANK_OFFICER"`
 *   will be stripped during parsing, and the backend registration service
 *   unconditionally assigns `UserRole.LOAN_APPLICANT`.
 */
export const RegisterApplicantInputSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters long.")
      .max(50, "First name must not exceed 50 characters."),
    lastName: z
      .string()
      .trim()
      .min(1, "Last name must be at least 1 character long.")
      .max(50, "Last name must not exceed 50 characters."),
    email: NormalizedEmailSchema,
    phone: OptionalIndianPhoneSchema,
    password: PasswordSchema,
    employmentType: z.string().trim().max(50).optional(),
    monthlyNetIncome: z.number().min(0, "Monthly net income cannot be negative.").max(100000000).optional(),
  })
  .strict(); // Rejects any unrecognized fields like `role` or `isAdmin`

export type RegisterApplicantInput = z.infer<typeof RegisterApplicantInputSchema>;

/**
 * User Login Input Schema.
 */
export const LoginInputSchema = z
  .object({
    email: NormalizedEmailSchema,
    password: z.string().min(1, "Password is required.").max(128),
    rememberMe: z.boolean().optional().default(false),
  })
  .strict();

export type LoginInput = z.infer<typeof LoginInputSchema>;

/**
 * Forgot Password Input Schema (Request reset email).
 */
export const ForgotPasswordInputSchema = z
  .object({
    email: NormalizedEmailSchema,
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

/**
 * Reset Password Input Schema (Consume token and update password).
 */
export const ResetPasswordInputSchema = z
  .object({
    token: z.string().trim().min(16, "Invalid reset token format."),
    password: PasswordSchema,
  })
  .strict();

export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

/**
 * Email Verification Input Schema (Consume verification token).
 */
export const VerifyEmailInputSchema = z
  .object({
    token: z.string().trim().min(16, "Invalid verification token format."),
  })
  .strict();

export type VerifyEmailInput = z.infer<typeof VerifyEmailInputSchema>;

/**
 * Bank Officer Provisioning Input Schema (Admin only).
 */
export const OfficerProvisioningInputSchema = z
  .object({
    firstName: z.string().trim().min(2).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: NormalizedEmailSchema,
    phone: OptionalIndianPhoneSchema,
    employeeCode: z
      .string()
      .trim()
      .min(3, "Employee code must be at least 3 characters.")
      .max(20)
      .transform((val) => val.toUpperCase()),
    department: z.string().trim().min(2, "Department is required.").max(100),
    branchCode: z.string().trim().max(20).optional().or(z.literal("")),
    designation: z.string().trim().min(2, "Designation is required.").max(100),
    approvalLimitAmount: z.number().positive("Approval limit must be greater than zero."),
    temporaryPassword: PasswordSchema,
  })
  .strict();

export type OfficerProvisioningInput = z.infer<typeof OfficerProvisioningInputSchema>;
