import React from "react";

export default function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block w-1 h-7 rounded-full bg-gradient-to-b from-primary to-primary/40" />
          <h1 className="text-2xl font-heading font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        {description && <p className="text-sm text-muted-foreground mt-0.5 sm:ml-4">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}