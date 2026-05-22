import React from "react";

export function cx(...values) {
  return values.filter(Boolean).join(" ");
}

export function AppSurface({ children, light, mode = "", homeActive = false, className = "", ...props }) {
  return (
    <div
      className={cx("flame-app", light && "light-mode", homeActive && "home-active", mode, className)}
      data-ui-surface="app"
      {...props}
    >
      {children}
    </div>
  );
}

export function PageFrame({ children, routeKey, className = "" }) {
  return (
    <div
      key={routeKey}
      className={cx("screen-transition-wrapper ui-page-frame", className)}
    >
      {children}
    </div>
  );
}

export function UiCard({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component className={cx("ui-card", className)} {...props}>
      {children}
    </Component>
  );
}

export function UiStack({ as: Component = "div", className = "", children, ...props }) {
  return (
    <Component className={cx("ui-stack", className)} {...props}>
      {children}
    </Component>
  );
}
