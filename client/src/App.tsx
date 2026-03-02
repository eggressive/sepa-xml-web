import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { useMemo } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

/**
 * Detect if running from file:// protocol (offline portable version).
 * When opened from file://, wouter sees the full filesystem path as the URL,
 * which doesn't match "/". We use wouter's base prop to handle this.
 */
function useBasePath() {
  return useMemo(() => {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      // For file:// URLs, the pathname is the full path to the HTML file.
      // We set the base to the full pathname so that "/" route matches.
      return window.location.pathname;
    }
    return "";
  }, []);
}

function AppRouter() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Page not found</p>
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  const basePath = useBasePath();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {basePath ? (
            <WouterRouter base={basePath}>
              <AppRouter />
            </WouterRouter>
          ) : (
            <AppRouter />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
