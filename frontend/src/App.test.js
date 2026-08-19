import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      status: 401,
      ok: false,
      json: async () => ({ error: 'Not logged in' }),
    })
  );
});

test('renders login prompt', () => {
  render(<App />);
  expect(screen.getByText(/Seamless DJ/i)).toBeInTheDocument();
  expect(screen.getByText(/Log in with Spotify/i)).toBeInTheDocument();
});
