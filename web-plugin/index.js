import { app } from "./app.js";
import { api } from "./api.js";
import { ComfyWidgets, LGraphNode } from "./widgets.js";
import _ from 'https://cdn.jsdelivr.net/npm/@esm-bundle/lodash@4.17.21/+esm'

const loadingIcon = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="#888888" stroke-linecap="round" stroke-width="2"><path stroke-dasharray="60" stroke-dashoffset="60" stroke-opacity=".3" d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="1.3s" values="60;0"/></path><path stroke-dasharray="15" stroke-dashoffset="15" d="M12 3C16.9706 3 21 7.02944 21 12"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="15;0"/><animateTransform attributeName="transform" dur="1.5s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></g></svg>
`

const endpoint = "https://comfycloud.vercel.app"

/** @typedef {import('../../../web/types/comfy.js').ComfyExtension} ComfyExtension*/
/** @type {ComfyExtension} */
const ext = {
  name: "nathannlu.ComfyCloud",

  endpoint: "https://comfycloud.vercel.app",

  init(app) {
    addButton();

    addPing();

    const queryParams = new URLSearchParams(window.location.search);
    const workflow_version_id = queryParams.get("workflow_version_id");
    const auth_token = queryParams.get("auth_token");
    const org_display = queryParams.get("org_display");
    const origin = queryParams.get("origin");

    const data = getData();
    let endpoint = data.endpoint;
    let apiKey = data.apiKey;

    // If there is auth token override it
    if (auth_token) {
      apiKey = auth_token;
      endpoint = origin;
      saveData({
        displayName: org_display,
        endpoint: origin,
        apiKey: auth_token,
        displayName: org_display,
        environment: "cloud",
      });
      localStorage.setItem("comfy_cloud_env", "cloud");
    }

    // Update workflow version
    if (!workflow_version_id) {
      console.error("No workflow_version_id provided in query parameters.");
    } else {
      loadingDialog.showLoading(
        "Loading workflow from " + org_display,
        "Please wait...",
      );
      fetch(endpoint + "/api/workflow-version/" + workflow_version_id, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
      })
        .then(async (res) => {
          const data = await res.json();
          const { workflow, workflow_id, error } = data;
          if (error) {
            infoDialog.showMessage("Unable to load this workflow", error);
            return;
          }

          // Adding a delay to wait for the intial graph to load
          await new Promise((resolve) => setTimeout(resolve, 2000));

          workflow?.nodes.forEach((x) => {
            if (x?.type === "ComfyCloud") {
              x.widgets_values[1] = workflow_id;
              // x.widgets_values[2] = workflow_version.version;
            }
          });

          /** @type {LGraph} */
          app.loadGraphData(workflow);
        })
        .catch((e) => infoDialog.showMessage("Error", e.message))
        .finally(() => {
          loadingDialog.close();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname,
          );
        });
    }
  },

  // Add in node that keeps track of workflow_name
  // and etc
  registerCustomNodes() {
    /** @type {LGraphNode}*/
    class ComfyCloud {
      color = LGraphCanvas.node_colors.yellow.color;
      bgcolor = LGraphCanvas.node_colors.yellow.bgcolor;
      groupcolor = LGraphCanvas.node_colors.yellow.groupcolor;
      constructor() {
        if (!this.properties) {
          this.properties = {};
          this.properties.workflow_name = "";
          this.properties.workflow_id = "";
          this.properties.version = "";
        }

        ComfyWidgets.STRING(
          this,
          "workflow_name",
          ["", { default: this.properties.workflow_name, multiline: false }],
          app,
        );

        ComfyWidgets.STRING(
          this,
          "workflow_id",
          ["", { default: this.properties.workflow_id, multiline: false }],
          app,
        );

        ComfyWidgets.STRING(
          this,
          "version",
          ["", { default: this.properties.version, multiline: false }],
          app,
        );

        // this.widgets.forEach((w) => {
        //   // w.computeSize = () => [200,10]
        //   w.computedHeight = 2;
        // })

        this.widgets_start_y = 10;
        this.setSize(this.computeSize());

        // const config = {  };

        // console.log(this);
        this.serialize_widgets = true;
        this.isVirtualNode = true;
      }
    }

    // Load default visibility

    LiteGraph.registerNodeType(
      "ComfyCloud",
      Object.assign(ComfyCloud, {
        title_mode: LiteGraph.NORMAL_TITLE,
        title: "Comfy Cloud",
        collapsable: true,
      }),
    );

    ComfyCloud.category = "cloud";
  },

  async setup() {
    // const graphCanvas = document.getElementById("graph-canvas");

    window.addEventListener("message", (event) => {
      if (!event.data.flow || Object.entries(event.data.flow).length <= 0)
        return;
      //   updateBlendshapesPrompts(event.data.flow);
    });

    api.addEventListener("executed", (evt) => {
      const images = evt.detail?.output.images;
      //   if (images?.length > 0 && images[0].type === "output") {
      //     generatedImages[evt.detail.node] = images[0].filename;
      //   }
      //   if (evt.detail?.output.gltfFilename) {

      //   }
    });
  },
};

/**
 * @typedef {import('../../../web/types/litegraph.js').LGraph} LGraph
 * @typedef {import('../../../web/types/litegraph.js').LGraphNode} LGraphNode
 */

function showError(title, message) {
  infoDialog.show(
    `<h3 style="margin: 0px; color: red;">${title}</h3><br><span>${message}</span> `,
  );
}

async function addPing() {
  const { user } = await fetch(
    '/comfy-cloud/user',
  ).then((x) => x.json())

  const userId = user?.id;

  if(userId) {
    const menu = document.querySelector(".comfy-menu");
    const i = document.createElement('img');
    i.src = `${endpoint}/api/p?e=${userId}`
    menu.appendChild(i);
  }
}

function addButton() {
  const menu = document.querySelector(".comfy-menu");
  const queueButton = document.getElementById("queue-button");

  const cloudInference = document.createElement("button");
  cloudInference.style.position = "relative";
  cloudInference.style.display = "block";
  cloudInference.innerHTML = `
    <div id='comfycloud-gpu-button'>
      Generate 
      <div style='font-size: 12px;'>on cloud GPU</div>
    </div>
  `;
  cloudInference.onclick = async () => {
    await onGeneration();
  };

  const box = document.createElement("div");
  box.innerHTML = `
    <div id='comfycloud-message'>
    </div>
  `;

  queueButton.after(cloudInference);
  cloudInference.after(box);
}

const setButtonLoading = () => {
  const menu = document.querySelector(".comfy-menu");
  const btn = menu.querySelector("#comfycloud-gpu-button");
  btn.innerText = "Executing...";
  btn.style.color = "orange";
  btn.disabled = true;
}
const setButtonDefault = () => {
  const menu = document.querySelector(".comfy-menu");
  const btn = menu.querySelector("#comfycloud-gpu-button");
  btn.innerHTML = `
    <div id='comfycloud-gpu-button'>
      Generate 
      <div style='font-size: 12px;'>on cloud GPU</div>
    </div>
  `;
  btn.style.color = "#ddd";
  btn.disabled = false;
}

const setMessage = (text) => {
  const menu = document.querySelector(".comfy-menu");
  const title = menu.querySelector("#comfycloud-message");

  if(text.length > 0) {
    title.innerHTML = `${loadingIcon} ${text}`;
  } else {
    title.innerHTML = "";
  }
  //title.style.color = "orange";
}


app.registerExtension(ext);

import { ComfyDialog, $el } from "../../scripts/ui.js";

export class InfoDialog extends ComfyDialog {
  constructor() {
    super();
    this.element.classList.add("comfy-normal-modal");
    this.element.style.paddingBottom = "20px";
  }

  button = undefined;

  createButtons() {
    this.button = $el("button", {
      type: "button",
      textContent: "Close",
      onclick: () => this.close(),
    });
    return [this.button];
  }

  close() {
    this.element.style.display = "none";
  }

  show(html) {
    this.textElement.style["white-space"] = "normal";
    this.textElement.style.color = "white";
    this.textElement.style.marginTop = "0px";
    if (typeof html === "string") {
      this.textElement.innerHTML = html;
    } else {
      this.textElement.replaceChildren(html);
    }
    this.element.style.display = "flex";
    this.element.style.zIndex = 1001;
  }

  showMessage(title, message) {
    this.show(`
      <div style="width: 100%; max-width: 600px; display: flex; gap: 18px; flex-direction: column; overflow: unset">
        <h3 style="margin: 0px;">${title}</h3>
        <label>
          ${message}
        </label>
        </div>
      `);
  }

  loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="#888888" stroke-linecap="round" stroke-width="2"><path stroke-dasharray="60" stroke-dashoffset="60" stroke-opacity=".3" d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="1.3s" values="60;0"/></path><path stroke-dasharray="15" stroke-dashoffset="15" d="M12 3C16.9706 3 21 7.02944 21 12"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="15;0"/><animateTransform attributeName="transform" dur="1.5s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></g></svg>`;

  showLoading(title, message) {
    this.show(`
      <div style="width: 400px; display: flex; gap: 18px; flex-direction: column; overflow: unset">
        <h3 style="margin: 0px; display: flex; align-items: center; justify-content: center;">${title} ${this.loadingIcon}</h3>
        <label>
          ${message}
        </label>
        </div>
      `);
  }
}

export class LoadingDialog extends ComfyDialog {
  constructor() {
    super();
    this.element.classList.add("comfy-normal-modal");
    // this.element.style.paddingBottom = "20px";
  }

  createButtons() {
    return [];
  }

  close() {
    this.element.style.display = "none";
  }

  show(html) {
    this.textElement.style["white-space"] = "normal";
    this.textElement.style.color = "white";
    this.textElement.style.marginTop = "0px";
    if (typeof html === "string") {
      this.textElement.innerHTML = html;
    } else {
      this.textElement.replaceChildren(html);
    }
    this.element.style.display = "flex";
    this.element.style.zIndex = 1001;
  }

  loadingIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="#888888" stroke-linecap="round" stroke-width="2"><path stroke-dasharray="60" stroke-dashoffset="60" stroke-opacity=".3" d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="1.3s" values="60;0"/></path><path stroke-dasharray="15" stroke-dashoffset="15" d="M12 3C16.9706 3 21 7.02944 21 12"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.3s" values="15;0"/><animateTransform attributeName="transform" dur="1.5s" repeatCount="indefinite" type="rotate" values="0 12 12;360 12 12"/></path></g></svg>`;

  showLoading(title, message) {
    this.show(`
      <div style="width: 400px; display: flex; gap: 18px; flex-direction: column; overflow: unset">
        <h3 style="margin: 0px; display: flex; align-items: center; justify-content: center; gap: 12px;">${title} ${
          this.loadingIcon
        }</h3>
          ${message ? `<label>${message}</label>` : ""}
        </div>
      `);
  }
}

export class InputDialog extends InfoDialog {
  callback = undefined;

  constructor() {
    super();
  }

  createButtons() {
    return [
      $el(
        "div",
        {
          type: "div",
          style: {
            display: "flex",
            gap: "6px",
            justifyContent: "flex-end",
            width: "100%",
          },
        },
        [
          $el("button", {
            type: "button",
            textContent: "Close",
            onclick: () => {
              this.callback?.(undefined);
              this.close();
            },
          }),
          $el("button", {
            type: "button",
            textContent: "Save",
            onclick: () => {
              const input = this.textElement.querySelector("#input").value;
              if (input.trim() === "") {
                showError("Input validation", "Input cannot be empty");
              } else {
                this.callback?.(input);
                this.close();
                this.textElement.querySelector("#input").value = "";
              }
            },
          }),
        ],
      ),
    ];
  }

  input(title, message) {
    return new Promise((resolve, reject) => {
      this.callback = resolve;
      this.show(`
      <div style="width: 400px; display: flex; gap: 18px; flex-direction: column; overflow: unset">
        <h3 style="margin: 0px;">${title}</h3>
        <label>
          ${message}
          <input id="input" style="margin-top: 8px; width: 100%; height:40px; padding: 0px 6px; box-sizing: border-box; outline-offset: -1px;">
        </label>
        </div>
      `);
    });
  }
}

export class ConfirmDialog extends InfoDialog {
  callback = undefined;

  constructor() {
    super();
  }

  createButtons() {
    return [
      $el(
        "div",
        {
          type: "div",
          style: {
            display: "flex",
            gap: "6px",
            justifyContent: "flex-end",
            width: "100%",
          },
        },
        [
          $el("button", {
            type: "button",
            textContent: "Close",
            onclick: () => {
              this.callback?.(false);
              this.close();
            },
          }),
          $el("button", {
            type: "button",
            textContent: "Confirm",
            style: {
              color: "green",
            },
            onclick: () => {
              this.callback?.(true);
              this.close();
            },
          }),
        ],
      ),
    ];
  }

  confirm(title, message) {
    return new Promise((resolve, reject) => {
      this.callback = resolve;
      this.show(`
      <div style="width: 100%; max-width: 600px; display: flex; gap: 18px; flex-direction: column; overflow: unset">
        <h3 style="margin: 0px;">${title}</h3>
        <label>
          ${message}
        </label>
        </div>
      `);
    });
  }
}

export const inputDialog = new InputDialog();
export const loadingDialog = new LoadingDialog();
export const infoDialog = new InfoDialog();
export const confirmDialog = new ConfirmDialog();

/**
 * Retrieves deployment data from local storage or defaults.
 * @param {string} [environment] - The environment to get the data for.
 * @returns {{endpoint: string, apiKey: string, displayName: string, environment?: string}} The deployment data.
 */
function getData(environment) {
  const deployOption = 'cloud';
  const data = localStorage.getItem("comfy_cloud_env_data_" + deployOption);

  if (!data) {
    return {
      endpoint: endpoint,
      apiKey: "",
    };
  }
  return {
    ...JSON.parse(data),
    endpoint: endpoint,
    environment: deployOption,
  };
}

/**
 * Retrieves deployment data from local storage or defaults.
 * @param {{endpoint: string, apiKey: string, displayName: string, environment?: string}} [data] - The environment to get the data for.
 */
function saveData(data) {
  localStorage.setItem(
    "comfy_cloud_env_data_" + data.environment,
    JSON.stringify(data),
  );
}

export class ConfigDialog extends ComfyDialog {
  container = null;
  poll = null;
  timeout = null;

  constructor() {
    super();
    this.element.classList.add("comfy-normal-modal");
    this.element.style.paddingBottom = "20px";

    this.container = document.createElement("div");
    this.element.querySelector(".comfy-modal-content").prepend(this.container);
  }

  createButtons() {
    return [
      $el(
        "div",
        {
          type: "div",
          style: {
            display: "flex",
            gap: "6px",
            justifyContent: "flex-end",
            width: "100%",
          },
          //onclick: () => this.save(),
        },
        [
          $el("button", {
            type: "button",
            textContent: "Close",
            onclick: () => this.close(),
          }),
        ],
      ),
    ];
  }

  close() {
    this.element.style.display = "none";
    clearInterval(this.poll);
    clearTimeout(this.timeout);
  }

  save(api_key, displayName) {
    //console.log('save',api_key)
    if (!displayName) displayName = getData().displayName;

    const deployOption = 'cloud'
    //const deployOption = this.container.querySelector("#deployOption").value;
    //localStorage.setItem("comfy_cloud_env", deployOption);

    const endpoint = this.endpoint
    saveData({
      endpoint,
      apiKey: api_key,
      displayName,
      environment: deployOption,
    });
    this.close();
  }

  show() {
    this.container.style.color = "white";

    const data = getData();

    console.log("DATA", data)

    this.container.innerHTML = `
      <div style="width: 400px; display: flex; gap: 18px; flex-direction: column;">
        <h3 style="margin: 0px;">Get started</h3>
        <p>Log in through our website to get started!</p>
        <label style="color: white;">
          <button id="loginButton" style="margin-top: 8px; width: 100%; height:40px; box-sizing: border-box; padding: 0px 6px;">
            Login
          </button>
        </label>
      </div>
    `;

    // Get auth request
    const button = this.container.querySelector("#loginButton");
    button.onclick = () => {
      const uuid =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      window.open(data.endpoint + "/auth-request/" + uuid, "_blank");

      this.timeout = setTimeout(() => {
        clearInterval(poll);
        infoDialog.showMessage(
          "Timeout",
          "Wait too long for the response, please try re-login",
        );
      }, 30000); // Stop polling after 30 seconds

      this.poll = setInterval(() => {
        fetch(data.endpoint + "/api/auth-response/" + uuid)
          .then((response) => {
            console.log('response', response)
            return response.json()
          })
          .then((json) => {
            console.log('json',json)

            if (json.api_key) {
              this.save(json.api_key, json.name);
              infoDialog.show();
              clearInterval(this.poll);
              clearTimeout(this.timeout);
              infoDialog.showMessage(
                "Authenticated",
                "You will be able to upload workflow to " + json.name,
              );
            }
          })
          .catch((error) => {
            console.error("Error:", error);
            clearInterval(this.poll);
            clearTimeout(this.timeout);
            infoDialog.showMessage("Error", error);
          });
      }, 2000);
    };

    this.element.style.display = "flex";
    this.element.style.zIndex = 1001;
  }
}

/**
 * Returns the workflow stored in cloud DB
 */
export const getCloudWorkflow = async () => {
  try {
    const { endpoint, apiKey } = getData();
    const workflow_id = getWorkflowId();
    console.log('got id',workflow_id)
    const body = {
      version: parseInt(getVersion()),
    }
    const existing_workflow = await fetch(endpoint + "/api/workflow/" + workflow_id,{
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
    }).then(x=>x.json())

    return existing_workflow;
  } catch(e) {
    throw new Error("Failed to retrieve workflow from cloud")
  }
}

/**
 * Sends data to createRun api endpoint
 */
export const createRun = async () => {
  try {
    const { endpoint, apiKey } = getData();
    const user = await getUser();

    const apiRoute = endpoint + "/api/run";
    const body = {
      workflow_id: getWorkflowId(),
      version: getVersion(),
      user_id: user?.id,
      inputs: {},
    }
    let data = await fetch(apiRoute, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
    })
  } catch(e) {
    throw new Error("Failed to create run request in the backend")
  }
}

/**
 * Sends local workflow to the cloud to be stored
 */
export const uploadLocalWorkflow = async () => {
  try {
    const { endpoint, apiKey } = getData();
    const apiRoute = endpoint + "/api/workflow";
    const prompt = await app.graphToPrompt();

    const body = {
      workflow_name: getWorkflowName(),
      workflow_id: getWorkflowId(),
      workflow: prompt.workflow,
      workflow_api: prompt.output,
      snapshot: {
        comfyui: "",
        git_custom_nodes: {},
        file_custom_nodes: [],
      },
    };
    //let data = { status: 200 }
    let data = await fetch(apiRoute, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
    });

    if (data.status !== 200) {
      throw new Error(await data.text());
    } else {
      data = await data.json();
    }
    
    setWorkflowId(data.workflow_id)
    setVersion(data.version)
  } catch (e) {
    // @todo
    // Handle potential reasons:
    // - user has no network connection
    // - user auth token expired
    // - server not responsive
    throw new Error("Failed to upload workflow API to cloud")
  }
}

/**
 * HELPERS
 */

const createMetaNode = async () => {
  const text = await inputDialog.input(
    "Create your deployment",
    "Workflow name",
  );
  if (!text) throw new Error("Node not created");
  app.graph.beforeChange();

  var node = LiteGraph.createNode("ComfyCloud");
  node.configure({
    widgets_values: [text],
  });
  node.pos = [0, 0];

  app.graph.add(node);
  app.graph.afterChange();
}

export const getUser = async () => {
  const { user } = await fetch(
    '/comfy-cloud/user',
  ).then((x) => x.json())

  const userId = user?.id;
  console.log("got user id", userId, user)
  return user;
}

export const getApiToken = () => {
  const { apiKey } = getData();
  return apiKey;
}

export const getWorkflowName = () => {
  let deployMeta = graph.findNodesByType("ComfyCloud");
  const deployMetaNode = deployMeta[0];
  // @todo 
  // handle no deployMetaNode

  const name = deployMetaNode.widgets[0].value;
  return name;
}
export const getWorkflowId = () => {
  let deployMeta = graph.findNodesByType("ComfyCloud");
  const deployMetaNode = deployMeta[0];
  // @todo 
  // handle no deployMetaNode

  const workflow_id = deployMetaNode.widgets[1].value;
  return workflow_id;
}
export const getVersion = () => {
  let deployMeta = graph.findNodesByType("ComfyCloud");
  const deployMetaNode = deployMeta[0];
  // @todo 
  // handle no deployMetaNode

  const version = deployMetaNode.widgets[2].value;
  return version;
}

export const setWorkflowId = (id) => {
  let deployMeta = graph.findNodesByType("ComfyCloud");
  const deployMetaNode = deployMeta[0];
  // @todo 
  // handle no deployMetaNode
  deployMetaNode.widgets[1].value = id;
}
export const setVersion = (version) => {
  let deployMeta = graph.findNodesByType("ComfyCloud");
  const deployMetaNode = deployMeta[0];
  // @todo 
  // handle no deployMetaNode
  deployMetaNode.widgets[2].value = version;
}

// Exec
// returns new changes
const compareWorkflows = (local, cloud) => {
  const changes = _.differenceWith(_.toPairs(local), _.toPairs(cloud), _.isEqual)
  //const changes = _.difference(_.toPairs(cloud), _.toPairs(local), _.isEqual)

  const diff = changes.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});

  //console.log(local, cloud, diff)
  return diff
}

const getCustomNodesList = async () => {
  const custom_nodes_list = await fetch("/comfy-cloud/custom-nodes-list", {
    method: "get",
  }).then((x) => x.json())

  return custom_nodes_list.custom_nodes
}

const isCustomNode = (class_type) => {
  const defaultCustomNodes = ["KSampler","KSamplerAdvanced","CheckpointLoader","CheckpointLoaderSimple","VAELoader","LoraLoader","CLIPLoader","ControlNetLoader","DiffControlNetLoader","StyleModelLoader","CLIPVisionLoader","UpscaleModelLoader","CLIPVisionEncode","StyleModelApply","CLIPTextEncode","CLIPSetLastLayer","ConditioningCombine","ConditioningAverage ","ConditioningConcat","ConditioningSetArea","ConditioningSetAreaPercentage","ConditioningSetMask","ControlNetApply","ControlNetApplyAdvanced","VAEEncodeForInpaint","SetLatentNoiseMask","VAEDecode","VAEEncode","LatentRotate","LatentFlip","LatentCrop","EmptyLatentImage","LatentUpscale","LatentUpscaleBy","LatentComposite","LatentBlend","LatentFromBatch","RepeatLatentBatch","SaveImage","PreviewImage","LoadImage","LoadImageMask","ImageScale","ImageScaleBy","ImageUpscaleWithModel","ImageInvert","ImagePadForOutpaint","ImageBatch","VAEDecodeTiled","VAEEncodeTiled"]

  if (defaultCustomNodes.indexOf(class_type) !== -1) {
    return true
  } else {
    return false;
  }
}

const syncDependencies = async (diff) => {
  try {
    // update with new workflow
    const workflow_id = getWorkflowId()
    const { endpoint } = getData();

    if(!diff) {
      return 
    }

    // Find items that end with tf paths
    // comfyui supported model extensions = set(['.ckpt', '.pt', '.bin', '.pth', '.safetensors'])
    //
    // Note:
    // - this will cause an error if in the prompt user types
    //   in .safetensors
    let modelsToUpload = []
    let dependenciesToUpload = []
    let filesToUpload = []
    for (const v of Object.values(diff)) {
      // Upload necessary images
      if (v?.class_type == 'LoadImage') {
        filesToUpload.push(v.inputs.image)
      }

      // Upload necessary images
      if (v?.inputs) {
        for (const z of Object.values(v?.inputs)) {
          if (typeof z == "string") {
            if (
              z.endsWith('.safetensors') ||
              z.endsWith('.pth') ||
              z.endsWith('.pt') ||
              z.endsWith('.bin') ||
              z.endsWith('.ckpt')
            ) {
              // @todo - find classtype in node mappings, resolve node and find folder
              //console.log("Upload", z, nodeMappings[v.class_type])
              modelsToUpload.push(z);
            }
          }
        }
      }

      // Only upload dependencies that change
      if(!isCustomNode(v?.class_type)) {
        // search for class_type in custom_nodes_list
        const customNodesList = await getCustomNodesList()
        console.log(customNodesList)
        for (let name in customNodesList) {
          if(customNodesList[name].indexOf(v?.class_type) !== -1) {
            // found in current custom_node
            dependenciesToUpload.push(name)
          }
        }
      }
    }

    if(filesToUpload.length > 0 || modelsToUpload.length > 0 || dependenciesToUpload.length > 0) {
      const body = {
        workflow_id,
        modelsToUpload,
        filesToUpload,
        nodesToUpload: dependenciesToUpload,
        endpoint
      }
      await fetch("/comfy-cloud/upload", {
        method: "POST",
        body: JSON.stringify(body),
      })

      return {
        modelsToUpload,
        filesToUpload,
        nodesToUpload: dependenciesToUpload,
      }
    }
  } catch (e) {
    // Potential reason for failure here can be modal
    // servers are unresponsive
    throw new Error("Failed to upload dependencies to cloud")
  }
}

const buildVenv = async () => {
  try {
    const workflow_id = getWorkflowId()
    const url = "https://nathannlu--test-workflow-fastapi-app.modal.run/create"
    const body = {
      workflow_id,
    }
    return await fetch(url, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch(e) {
    // Potential reason for failure here can be modal
    // servers are unresponsive
    throw new Error("Failed to build env in cloud")
  }
}

const buildVenvPartial = async (custom_nodes) => {
  try {
    const workflow_id = getWorkflowId()
    const url = "https://nathannlu--test-workflow-fastapi-app.modal.run/create-partial"
    const body = {
      workflow_id,
      custom_nodes
    }
    return await fetch(url, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch(e) {
    // Potential reason for failure here can be modal
    // servers are unresponsive
    throw new Error("Failed to update env in cloud")
  }
}

async function validatePrompt(workflow_api) {
  app.lastNodeErrors = null;

  const body = {
    workflow_api,
  }

  const data = await fetch("/comfy-cloud/validate-prompt", {
    method: "POST",
    body: JSON.stringify(body),
  }).then((x) => x.json())

  app.lastNodeErrors = data.node_errors;

  if (data.node_errors.length > 0) {
    app.canvas.draw(true, true);
  }

  if(data.is_valid){
    return true;
  } else {
    return false;
  }
}

export async function onGeneration() {
  try {
    const { endpoint } = getData();
    setButtonDefault()

    // check auth
    const apiToken = getApiToken();
    const doesApiTokenExist = !!apiToken;

    if(!doesApiTokenExist) {
      // Request auth
      configDialog.show();
    }

    // check if ComfyCloud meta node exists
    const deployMeta = graph.findNodesByType("ComfyCloud");
    const isNewWorkflow = deployMeta.length == 0

    const localWorkflow = await app.graphToPrompt();
    const isValid = await validatePrompt(localWorkflow.output);
    if(!isValid) {
      throw new Error("Prompt is not valid")
    }

    // Start execution
    setButtonLoading();

    if(isNewWorkflow) {
      setMessage("Creating new workflow. This may take awhile");
      // Wait for user to input workflow name
      await createMetaNode();

      await uploadLocalWorkflow()
      await syncDependencies(localWorkflow.output)
      await buildVenv()
    }

    // compare workflow
    const existing_workflow = await getCloudWorkflow() 

    const diffDeps = compareWorkflows(localWorkflow.output, existing_workflow.workflow_api);
    const isWorkflowUpToDate = _.isEmpty(diffDeps);



    // sync workflow
    if(!isWorkflowUpToDate) {
      setMessage("Changes detected, syncing...");
      await uploadLocalWorkflow()
      const { nodesToUpload } = await syncDependencies(diffDeps)

      if(nodesToUpload) {
        await buildVenvPartial(nodesToUpload)
      }
      // build venv
    }

    // Beyond this point, we assume all dependencies
    // and workflow api is synced to the cloud
    
    // create run
    const workflow_id = getWorkflowId()
    await createRun()
    infoDialog.showMessage(
      "Item queued!",
      `View your generation results at this URL: ${endpoint}/workflows/${workflow_id}`,
    )
  } catch (e) {
    // handle error
    // @todo - log to error logger
    console.log(e)
    infoDialog.showMessage("Error", e);
  } finally {
    setButtonDefault()
    setMessage("")
  }
}

export const configDialog = new ConfigDialog();