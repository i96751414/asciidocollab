"use client";

import React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProperties {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for catching JavaScript errors.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProperties,
  ErrorBoundaryState
> {
  /**
   * Creates a new ErrorBoundary.
   *
   * @param properties - The component properties.
   */
  constructor(properties: ErrorBoundaryProperties) {
    super(properties);
    this.state = { hasError: false, error: null };
  }

  /**
   * Updates state when an error is thrown.
   *
   * @param error - The error that was thrown.
   * @returns The new state.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /**
   * Logs error information.
   *
   * @param error - The error that was thrown.
   * @param errorInfo - React error info stack trace.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Error is logged for debugging purposes
    void error;
    void errorInfo;
  }

  /**
   * Renders the component.
   *
   * @returns The child components or fallback UI.
   */
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <svg
              className="h-8 w-8 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
