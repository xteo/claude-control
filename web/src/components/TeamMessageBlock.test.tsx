// @vitest-environment jsdom

/**
 * Tests for the TeamMessageBlock component.
 *
 * Validates rendering of direct messages, broadcasts, shutdown requests,
 * long content truncation with "Show more" toggle, and timestamp display.
 */

import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { TeamMessageBlock } from "./TeamMessageBlock.js";

describe("TeamMessageBlock", () => {
  it("renders a direct message with from/to labels and content", () => {
    render(
      <TeamMessageBlock
        from="team-lead"
        to="researcher"
        content="Please investigate the auth bug."
        messageType="message"
      />,
    );

    // From and to labels should be visible
    expect(screen.getByText("team-lead")).toBeInTheDocument();
    expect(screen.getByText("researcher")).toBeInTheDocument();
    // Arrow separator should be present
    expect(screen.getByText("\u2192")).toBeInTheDocument();
    // Content should be rendered
    expect(screen.getByText("Please investigate the auth bug.")).toBeInTheDocument();
  });

  it("renders broadcast message with 'all' recipient and broadcast badge", () => {
    render(
      <TeamMessageBlock
        from="team-lead"
        to={null}
        content="Stop all work immediately."
        messageType="broadcast"
      />,
    );

    // Broadcast shows "all" as the recipient
    expect(screen.getByText("all")).toBeInTheDocument();
    // Broadcast badge should be shown
    expect(screen.getByText("broadcast")).toBeInTheDocument();
  });

  it("renders shutdown request with amber styling and shutdown badge", () => {
    render(
      <TeamMessageBlock
        from="team-lead"
        to="researcher"
        content="Task complete, wrapping up."
        messageType="shutdown_request"
      />,
    );

    // Shutdown badge should be shown
    expect(screen.getByText("shutdown")).toBeInTheDocument();
    // Content still renders
    expect(screen.getByText("Task complete, wrapping up.")).toBeInTheDocument();
    // Should NOT show broadcast badge
    expect(screen.queryByText("broadcast")).not.toBeInTheDocument();
  });

  it("renders shutdown response with response badge", () => {
    render(
      <TeamMessageBlock
        from="researcher"
        to="team-lead"
        content="Acknowledged."
        messageType="shutdown_response"
      />,
    );

    expect(screen.getByText("response")).toBeInTheDocument();
  });

  it("truncates long content and shows 'Show more' button", () => {
    // Content longer than 200 chars to trigger truncation
    const longContent = "A".repeat(250);
    render(
      <TeamMessageBlock
        from="lead"
        to="coder"
        content={longContent}
        messageType="message"
      />,
    );

    // Should show truncated content (first 200 chars + "...")
    expect(screen.getByText(`${"A".repeat(200)}...`)).toBeInTheDocument();
    // "Show more" button should be present
    expect(screen.getByText("Show more")).toBeInTheDocument();
    // Full content should NOT be visible yet
    expect(screen.queryByText(longContent)).not.toBeInTheDocument();
  });

  it("expands long content when 'Show more' is clicked", () => {
    const longContent = "B".repeat(250);
    render(
      <TeamMessageBlock
        from="lead"
        to="coder"
        content={longContent}
        messageType="message"
      />,
    );

    // Click "Show more"
    fireEvent.click(screen.getByText("Show more"));

    // Full content should now be visible
    expect(screen.getByText(longContent)).toBeInTheDocument();
    // Button should now say "Show less"
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("does not show 'Show more' for short content", () => {
    render(
      <TeamMessageBlock
        from="lead"
        to="coder"
        content="Short message."
        messageType="message"
      />,
    );

    expect(screen.queryByText("Show more")).not.toBeInTheDocument();
  });

  it("renders timestamp when provided", () => {
    // Use a fixed timestamp: Jan 1, 2026 12:30:00 UTC
    const ts = new Date("2026-01-01T12:30:00Z").getTime();
    render(
      <TeamMessageBlock
        from="lead"
        to="coder"
        content="Check this out."
        messageType="message"
        timestamp={ts}
      />,
    );

    // The component uses toLocaleTimeString with hour+minute, so we look
    // for any element containing "12:30" (the exact format varies by locale)
    const container = screen.getByText("Check this out.").closest("div")!.parentElement!;
    // There should be a time string somewhere in the rendered output
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("does not render timestamp section when not provided", () => {
    const { container } = render(
      <TeamMessageBlock
        from="lead"
        to="coder"
        content="No timestamp."
        messageType="message"
      />,
    );

    // The timestamp wrapper uses text-[10px] class — verify there's no such element
    const timeElements = container.querySelectorAll('[class*="text-\\[10px\\]"]');
    expect(timeElements).toHaveLength(0);
  });
});
