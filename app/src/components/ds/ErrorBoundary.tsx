import { Component, type ErrorInfo, type ReactNode } from 'react';
import ErrorState from './ErrorState';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere below it and shows an Arabic fallback screen
 * with a reload action instead of a blank page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PrintFlow] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="grid min-h-[100dvh] place-items-center bg-[var(--paper-50)] px-6 py-10">
          <div className="w-full max-w-md space-y-4">
            <img src="/logo.svg" alt="ARTeam PrintFlow" className="mx-auto w-36" />
            <ErrorState
              title="عذرًا، حدث خطأ أثناء عرض الصفحة"
              helper="يمكنك إعادة تحميل الصفحة — بياناتك محفوظة محليًا ولن تضيع."
              action={
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="h-10 rounded-[10px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--cyan-500)] active:scale-[0.97]"
                >
                  إعادة تحميل الصفحة
                </button>
              }
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
