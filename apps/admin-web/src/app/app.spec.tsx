import { render, screen } from "@testing-library/react";

import { App } from "./app";

describe("Administrative shell", () => {
  it("renders the application heading and platform status", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Transmetro Administration" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Platform scaffold is ready.")).toBeInTheDocument();
  });
});
