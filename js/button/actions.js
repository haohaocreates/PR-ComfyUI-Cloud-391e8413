import { 
  uploadLocalWorkflow, 
  syncDependencies, 
  pollSyncDependencies, 
  getCloudWorkflow, 
  createEmptyWorkflow,
  createRun
} from "../client.js"
import { 
  getData, 
  createMetaNode, 
  getApiToken, 
  validatePrompt, 
  getWorkflowId, 
  compareWorkflows, 
  isWorkflowUpToDate
} from "../utils.js"
import { 
  app,
} from '../comfy/comfy.js'; 
import { 
  configDialog, 
  infoDialog,
} from '../comfy/ui.js'; 
import { 
  setButtonDefault,
  setButtonLoading,
  setMessage,
} from './ui.js'; 
import { logger } from '../logger.js';


export async function onGeneration() {
  logger.newLog();
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
    const deployMeta = app.graph.findNodesByType("ComfyCloud");
    const isNewWorkflow = deployMeta.length == 0

    const localWorkflow = await app.graphToPrompt();
    const isValid = await validatePrompt(localWorkflow.output);
    if(!isValid) {
      throw new Error("Prompt is not valid")
    }

    // Start execution
    setButtonLoading();

    if(isNewWorkflow) {
      // Wait for user to input workflow name
      await createMetaNode();
      await createEmptyWorkflow()

      setMessage("Creating new workflow. This may take awhile");
    }

    // compare workflow
    const existing_workflow = await getCloudWorkflow() 

    const diffDeps = compareWorkflows(localWorkflow.output, existing_workflow.workflow_api);

    // sync workflow
    if(!isWorkflowUpToDate(diffDeps)) {
      setMessage("Syncing dependencies...");
      const s = await syncDependencies(diffDeps)
      if(s?.taskId) {
        await pollSyncDependencies(s.taskId)
      }

      if(s?.nodesToUpload) {
        setMessage("Building environment...");
      }

      await uploadLocalWorkflow()
    }

    // @todo patch workflow inputs

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
    logger.error("onGeneration error", e)

    infoDialog.showMessage("Error", e);
  } finally {
    await logger.saveLog()
    setButtonDefault()
    setMessage("")
  }
}
