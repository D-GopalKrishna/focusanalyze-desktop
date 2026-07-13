export const getSortedTopics = (topics: any[]) => {
  const sortedTopics = [];
  topics.sort((a: any, b: any) => a.order - b.order);
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (topic.children && topic.children.length > 0) {
      const children = topic.children;
      children.sort((a: any, b: any) => a.order - b.order);
      sortedTopics.push({ ...topic, children, index: i + 1 });
    } else {
      sortedTopics.push({ ...topic, index: i + 1 });
    }
  }
  return sortedTopics;
};

export const createParentNodeForChildren = (topics: any[]) => {
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (topic.children && topic.children.length > 0) {
      const children = topic.children;
      for (let j = 0; j < children.length; j++) {
        children[j].parent = topic;
      }
    }
  }
  return topics;
};
