// Public Interface for src/features/auth
export {
  getUser,
  requireUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "./context";

export {
  loginWithPassword,
  registerProviderAccount,
  requestPasswordReset,
  resetPassword,
  signOutUser,
} from "./services";

export {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type RegisterInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "./schemas";

export {
  AuthError,
  isUnauthenticatedAuthError,
  type AuthErrorCode,
  type AuthenticatedUser,
  type ProviderContext,
  type ProviderMembership,
  type ProviderRole,
  type ProviderType,
} from "./types";
