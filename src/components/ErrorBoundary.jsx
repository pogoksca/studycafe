import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-white h-screen w-full flex flex-col items-center justify-center text-[#1C1C1E]">
          <h1 className="text-2xl font-black mb-4 text-ios-rose">Application Crash</h1>
          <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-w-full">
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-6 py-3 bg-ios-indigo text-white rounded-[6px] font-black"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
