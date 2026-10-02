import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Cozy Office UI error', error, info); }
  render() {
    if (this.state.error) return <main className="fatal-error"><h1>The studio hit a snag.</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Reload the app</button><p>Your last saved workspace is kept in this browser.</p></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
