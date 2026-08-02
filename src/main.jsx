import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('OneTouch interface failed to render', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ color: 'white', padding: 20, font: '13px system-ui', whiteSpace: 'pre-wrap' }}>
        {`OneTouch interface error\n${String(this.state.error?.stack || this.state.error)}`}
      </main>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
