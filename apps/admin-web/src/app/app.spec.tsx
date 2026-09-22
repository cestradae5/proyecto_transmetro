import { render, screen } from "@testing-library/react";
import { App } from "./app";

function renderApp(initialRoute = "/") {
  window.history.pushState({}, "", initialRoute);
  return render(<App />);
}

describe("Administrative shell", () => {
  it("redirects to /login by default", () => {
    renderApp("/");
    expect(screen.getByText("Iniciar Sesión")).toBeInTheDocument();
  });

  it("does not render the /admin route", () => {
    renderApp("/admin");
    expect(screen.queryByText("Platform scaffold is ready.")).not.toBeInTheDocument();
    expect(screen.queryByText("Transmetro Administration")).not.toBeInTheDocument();
  });

  it("does not render AdministrativeLanding scaffold message", () => {
    renderApp("/");
    expect(screen.queryByText("Platform scaffold is ready.")).not.toBeInTheDocument();
  });
});
