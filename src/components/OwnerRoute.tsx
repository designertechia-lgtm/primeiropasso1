import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface OwnerRouteProps {
  children: React.ReactNode;
}

export default function OwnerRoute({ children }: OwnerRouteProps) {
  const { user, isOwner, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-serif text-lg">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isOwner) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
