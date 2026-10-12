import { formatMetrics } from './metrics.mjs';

// /fast publishes this status only while its session preference is enabled.
// The inline label describes the toggle, not proof of the delivered service tier.
export function fastLabel(footerData) {
  const status = footerData.getExtensionStatuses().get('chatgpt-fast');
  if (status === undefined) return 'Fast off';
  return status === 'fast: inactive' ? 'Fast on (inactive)' : 'Fast on';
}

// Preserve the native stats and right-aligned model without stripping ANSI.
// Insertion consumes only padding; if there is no room, add a separate row.
export function decorateFooter(lines, width, text, theme, visibleWidth, truncateToWidth) {
  const result = [...lines];
  const line = result[1];
  const suffix = ` | ${text}`;
  const padding = line?.match(/ {2,}/);
  if (padding && padding[0].length >= visibleWidth(suffix) + 2) {
    const pos = padding.index;
    result[1] = line.slice(0,pos) + suffix +
      ' '.repeat(padding[0].length - visibleWidth(suffix)) + line.slice(pos+padding[0].length);
  } else {
    result.splice(Math.min(2,result.length),0,truncateToWidth(theme.fg('dim',text),width));
  }
  return result;
}

// A read-only facade for the exported native FooterComponent. Reusing its
// renderer retains upstream usage accounting (including cache warm/tool usage),
// cost, context colors, git/session name, model/thinking, and extension statuses.
export function sessionFacade(ctx, getThinkingLevel, getRoute) {
  let countedSession, countedLeaf, count=0;
  const manager = ctx.sessionManager;
  const sessionManager = {
    getCwd: () => manager.getCwd(),
    getSessionId: () => manager.getSessionId(),
    getLeafId: () => manager.getLeafId(),
    getSessionName: () => manager.getSessionName(),
    getEntries: () => manager.getEntries(),
    getEntryCount: () => {
      const session=manager.getSessionId(), leaf=manager.getLeafId();
      if (session !== countedSession || leaf !== countedLeaf) {
        count=manager.getEntries().length; countedSession=session; countedLeaf=leaf;
      }
      return count;
    },
  };
  return {
    sessionManager,
    get state() { return {model:ctx.model,thinkingLevel:ctx.thinkingLevel ?? getThinkingLevel()}; },
    get model() { return ctx.model; },
    get routedModel() { return getRoute(); },
    getContextUsage: () => ctx.getContextUsage(),
    modelRuntime: {
      isUsingSubscription: provider => !!ctx.model && provider===ctx.model.provider &&
        ctx.modelRegistry.isUsingOAuth(ctx.model) &&
        ctx.modelRegistry.getProvider(provider)?.auth?.oauth?.isSubscription === true,
    },
  };
}

export function makeFooter({ctx,pi,tui,theme,footerData,telemetry,getRoute,getIdentity,FooterComponent,visibleWidth,truncateToWidth}) {
  const session=sessionFacade(ctx,() => pi.getThinkingLevel(),getRoute);
  const nativeData = {
    getGitBranch: () => footerData.getGitBranch(),
    getAvailableProviderCount: () => footerData.getAvailableProviderCount(),
    onBranchChange: callback => footerData.onBranchChange(callback),
    getExtensionStatuses: () => {
      const statuses = new Map(footerData.getExtensionStatuses());
      statuses.delete('chatgpt-fast'); // Moved inline; don't duplicate the row.
      return statuses;
    },
  };
  const native=new FooterComponent(session,nativeData);
  const unsubscribe=footerData.onBranchChange(() => tui.requestRender());
  let disposed=false;
  return {
    invalidate() { native.invalidate(); },
    render(width) {
      if (width<=0) return [];
      native.setAutoCompactEnabled(pi.getSettings().compaction?.enabled ?? true);
      const model=getRoute()?.model ?? ctx.model;
      const identity=getIdentity ? getIdentity() : model ? {provider:model.provider,api:model.api,model:model.id} : undefined;
      const text = `${formatMetrics(telemetry.stats(identity))} | ${fastLabel(footerData)}`;
      return decorateFooter(native.render(width),width,text,theme,visibleWidth,truncateToWidth);
    },
    dispose() {
      if (disposed) return;
      disposed=true; unsubscribe(); native.dispose();
    },
  };
}
