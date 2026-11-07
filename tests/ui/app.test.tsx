// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../src/ui/App";

afterEach(cleanup);

describe("laboratory UI smoke test (laboratory-ui requirements 2.1 and 5.2)", () => {
  test("asking a sample question shows a stitched answer with a citation and a ghost note", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "What is the refund window for cancelled policies?" }));
    const answer = await screen.findByTestId("answer", {}, { timeout: 20000 });
    expect(answer.textContent).toContain("14 days");
    expect(screen.getAllByRole("button", { name: /Show source 1/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ghost caught:/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /sentences stitched from/ })).toBeTruthy();
  });

  test("the Crypt is sealed for a non-steward and open for the steward", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Crypt" }));
    expect(screen.getByTestId("crypt-sealed")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Who is in the lab?"), { target: { value: "iris" } });
    await waitFor(() => expect(screen.queryByTestId("crypt-sealed")).toBeNull(), { timeout: 20000 });
    expect(screen.getByRole("button", { name: "Verify chain" })).toBeTruthy();
  });

  test("a contractor gets the fixed no-answer message for a restricted topic", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Who is in the lab?"), { target: { value: "sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Is Gravewell Logistics under investigation?" }));
    const tomb = await screen.findByTestId("no-answer", {}, { timeout: 20000 });
    expect(tomb.textContent).toContain("No source you can open answers this yet.");
  });
});
