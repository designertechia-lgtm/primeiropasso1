import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, roles, isOwner, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-heading text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const hasAccess =
      roles.includes(requiredRole) ||
      (requiredRole === "professional" && (roles.includes("admin") || isOwner));
    if (!hasAccess) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
