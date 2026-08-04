import { createContext, use, type ReactNode } from "react";
import { type ImageSource } from "expo-image";
import { authBaseURL, authClient } from "@/lib/auth-client";

type AuthUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  displayName: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  avatarSource: ImageSource | null;
  isAuthenticated: boolean;
  isPending: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getInitials(name: string, email: string) {
  const source = name || email;
  const words = source
    .replace(/@.*/, "")
    .split(/\s|\.|_|-/)
    .filter(Boolean);

  return (words[0]?.[0] ?? "U").concat(words[1]?.[0] ?? words[0]?.[1] ?? "").toUpperCase();
}

function getAvatarSource(image: string | null): ImageSource | null {
  if (!image) return null;

  if (image.startsWith("profiles/")) {
    const cookie = authClient.getCookie();
    const uri = `${authBaseURL}/api/profile-photo?pathname=${encodeURIComponent(image)}`;

    return {
      uri,
      ...(cookie ? { headers: { Cookie: cookie } } : {}),
    };
  }

  return { uri: image };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = authClient.useSession();
  const user = session?.user ?? null;
  const email = user?.email ?? "";
  const displayName = user?.name || email || "Guest";
  const initials = getInitials(user?.name ?? "", email);
  const avatarUrl = user?.image ?? null;
  const avatarSource = getAvatarSource(avatarUrl);

  const signOut = async () => {
    await authClient.signOut();
  };

  return (
    <AuthContext
      value={{
        user,
        displayName,
        email,
        initials,
        avatarUrl,
        avatarSource,
        isAuthenticated: Boolean(user),
        isPending: Boolean(isPending),
        refresh: () => refetch(),
        signOut,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const value = use(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
