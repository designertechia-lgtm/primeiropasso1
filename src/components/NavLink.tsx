import { NavLink as RouterNavLink, NavLinkProps, useNavigate } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChanges";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onClick, ...props }, ref) => {
    const { isDirty, confirmNavigation } = useUnsavedChangesGuard();
    const navigate = useNavigate();

    return (
      <RouterNavLink
        ref={ref}
        to={to}
        onClick={(e) => {
          onClick?.(e);
          if (e.defaultPrevented) return;
          // Quando há alterações não salvas, interceptamos cliques simples e
          // pedimos confirmação antes de navegar. Modificadores (ctrl/cmd/shift,
          // botão do meio) seguem o comportamento padrão (abrir em nova aba etc.).
          const simpleClick =
            e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
          if (isDirty && typeof to === "string" && simpleClick) {
            e.preventDefault();
            confirmNavigation(() => navigate(to));
          }
        }}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
