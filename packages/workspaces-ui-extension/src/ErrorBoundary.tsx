import React from 'react';

export default class ErrorBoundary extends React.Component {
  state: { error: Error | null } = { error: null };

  componentDidCatch(error: Error | null) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ color: 'red', fontSize: '30px' }}>
          {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
