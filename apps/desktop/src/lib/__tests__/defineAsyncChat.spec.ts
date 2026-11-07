import { createRenderer, defineComponent, h, type App } from "vue";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineAsyncChat } from "../defineAsyncChat";

vi.mock("@/components/chat/ChatLoadState.vue", () => ({
  default: defineComponent({
    props: ["error"],
    setup: (props) => () => h("div", props.error ? "load-error" : "loading"),
  }),
}));

interface HostNode {
  text: string;
  children: HostNode[];
  parent: HostNode | null;
}
const node = (text = ""): HostNode => ({ text, children: [], parent: null });
const renderer = createRenderer<HostNode, HostNode>({
  createElement: () => node(),
  createText: node,
  createComment: () => node(),
  setText: (target, text) => {
    target.text = text;
  },
  setElementText: (target, text) => {
    target.text = text;
    target.children = [];
  },
  patchProp: () => {},
  parentNode: (target) => target.parent,
  nextSibling: (target) => {
    const siblings = target.parent?.children ?? [];
    return siblings[siblings.indexOf(target) + 1] ?? null;
  },
  insert(target, parent, anchor) {
    if (target.parent) {
      const old = target.parent.children;
      old.splice(old.indexOf(target), 1);
    }
    target.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(target);
    else parent.children.splice(index, 0, target);
  },
  remove(target) {
    if (target.parent) {
      const siblings = target.parent.children;
      siblings.splice(siblings.indexOf(target), 1);
      target.parent = null;
    }
  },
});
const text = (root: HostNode): string => root.text + root.children.map(text).join("");
let app: App | undefined;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.useRealTimers();
});

function mountChat(loader: () => Promise<ReturnType<typeof defineComponent>>) {
  const root = node();
  const Chat = defineAsyncChat(loader);
  app = renderer.createApp({ render: () => h(Chat) });
  app.config.errorHandler = () => {};
  app.mount(root);
  return root;
}

describe("async chat loading safety", () => {
  it("shows loading and recovers from a transient import failure", async () => {
    // Arrange
    const Ready = defineComponent({ render: () => h("div", "chat-ready") });
    const loader = vi.fn().mockRejectedValueOnce(new Error("not ready")).mockResolvedValue(Ready);
    const root = mountChat(loader);

    // Act
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);

    // Assert
    expect(text(root)).toBe("loading");

    // Act
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // Assert
    expect(text(root)).toBe("chat-ready");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("stops retrying permanent failures and shows an error instead of a blank panel", async () => {
    // Arrange
    const loader = vi.fn().mockRejectedValue(new Error("import failed"));
    const root = mountChat(loader);

    // Act
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    // Assert
    expect(text(root)).toBe("load-error");
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it("shows an error for a stalled import but accepts its eventual success", async () => {
    // Arrange
    const Ready = defineComponent({ render: () => h("div", "chat-ready") });
    let finish: (component: typeof Ready) => void = () => {};
    const root = mountChat(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );

    // Act
    await vi.advanceTimersByTimeAsync(15_000);

    // Assert
    expect(text(root)).toBe("load-error");

    // Act
    finish(Ready);
    await flushPromises();

    // Assert
    expect(text(root)).toBe("chat-ready");
  });
});
