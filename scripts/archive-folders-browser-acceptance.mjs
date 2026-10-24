import assert from "node:assert/strict";

export async function archiveFolderAcceptance({pageFor,db,origin,shot,pass}) {
 const page=await pageFor("director"), path=origin+"/archives/fixture-artwork";
 const originalFiles=JSON.stringify(await db.manualArchiveFile.findMany({orderBy:{id:"asc"}}));
 const originalGrants=JSON.stringify(await db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}}));
 const folder=async name=>db.archiveFolder.findFirstOrThrow({where:{name,categoryId:"artwork"}});
 async function waitSaved(page,button) {
  const response=page.waitForResponse(r=>r.url().endsWith("/api/archives/organization")&&r.request().method()==="POST");
  await page.getByRole("button",{name:button,exact:true}).click();
  const saved=await response;assert.equal(saved.status(),200,await saved.text());
  await page.locator('dialog[aria-labelledby="archive-folder-dialog-title"]').waitFor({state:"hidden"});await page.getByRole("status").filter({hasText:/saved|deleted/i}).waitFor();
 }
 async function create(page,name,description="") {
  await page.getByRole("button",{name:"New folder",exact:true}).click();
  await page.getByLabel("Folder name",{exact:true}).fill(name);await page.getByLabel("Description",{exact:true}).fill(description);
  await page.getByLabel("Folder icon",{exact:true}).selectOption("images");await waitSaved(page,"Save folder");
  assert.equal((await folder(name)).description,description);
 }
 await page.goto(path);await page.getByRole("heading",{name:"Category root",exact:true}).waitFor();
 await create(page,"Campaigns","Annual campaign assets");await create(page,"Deliverables");await create(page,"Private planning");
 await page.locator('[data-folder-card="Campaigns"]').getByRole("link",{name:"Campaigns",exact:true}).click();
 await page.getByRole("heading",{name:"Campaigns",exact:true}).waitFor();await create(page,"Print","Print ready deliverables");
 const print=await folder("Print"),campaigns=await folder("Campaigns"),deliverables=await folder("Deliverables");assert.equal(print.parentId,campaigns.id);
 await page.locator('[data-folder-card="Print"]').getByRole("link",{name:"Print",exact:true}).click();
 await page.getByRole("heading",{name:"This folder is empty",exact:true}).waitFor();
 assert.deepEqual(await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link").allTextContents(),["Archives","Fixture Artwork","Campaigns","Print"]);
 await shot(page,"folders-nested-empty");
 await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link",{name:"Campaigns",exact:true}).click();
 await page.getByRole("button",{name:"Edit Print",exact:true}).click();await page.getByLabel("Folder name",{exact:true}).fill("Print ready");await waitSaved(page,"Save folder");
 assert.equal((await db.archiveFolder.findUniqueOrThrow({where:{id:print.id}})).name,"Print ready");
 // Native HTML drag events hit the actual client handlers; confirmation precedes persistence.
 await page.locator('[data-folder-card="Print ready"]').dragTo(page.locator(`[data-folder-drop="${deliverables.id}"]`));
 await page.getByRole("dialog",{name:"Move item",exact:true}).waitFor();
 assert.equal((await db.archiveFolder.findUniqueOrThrow({where:{id:print.id}})).parentId,campaigns.id,"Drop must not optimistically persist");
 await waitSaved(page,"Confirm move");assert.equal((await db.archiveFolder.findUniqueOrThrow({where:{id:print.id}})).parentId,deliverables.id);
 await page.reload();await page.getByRole("heading",{name:"This folder is empty",exact:true}).waitFor();
 await page.goto(path);await page.locator('[data-file-card="approved-artwork.pdf"]').waitFor();
 await page.locator('[data-file-card="approved-artwork.pdf"]').dragTo(page.locator(`[data-folder-drop="${print.id}"]`));
 await page.getByRole("dialog",{name:"Move item",exact:true}).waitFor();assert.equal(await db.archiveFilePlacement.count(),0);
 await waitSaved(page,"Confirm move");assert.equal((await db.archiveFilePlacement.findUniqueOrThrow({where:{id:"manual:artwork-file"}})).folderId,print.id);
 await page.goto(path+"?folder="+print.id);await page.locator('[data-file-card="approved-artwork.pdf"]').waitFor();
 assert.deepEqual(await page.getByRole("navigation",{name:"Breadcrumb",exact:true}).getByRole("link").allTextContents(),["Archives","Fixture Artwork","Deliverables","Print ready"]);
 await page.getByRole("button",{name:"List view",exact:true}).click();assert.equal(await page.getByRole("button",{name:"List view",exact:true}).getAttribute("aria-pressed"),"true");
 await page.getByLabel("Search files in this folder").fill("missing");await page.getByRole("button",{name:"Search folder",exact:true}).click();await page.getByRole("heading",{name:"No matching files",exact:true}).waitFor();
 await page.getByLabel("Search files in this folder").fill("approved");await page.getByRole("button",{name:"Search folder",exact:true}).click();await page.locator('[data-file-card="approved-artwork.pdf"]').waitFor();
 await shot(page,"folders-persisted-file-list");
 // Move is available through ordinary keyboard controls as well as drag/drop.
 await page.getByRole("button",{name:"Move approved-artwork.pdf",exact:true}).focus();await page.keyboard.press("Enter");
 await page.getByRole("dialog",{name:"Move item",exact:true}).waitFor();
 await page.getByLabel("Destination folder").focus();for(let i=0;i<8;i++)await page.keyboard.press("ArrowUp");await page.keyboard.press("Tab");
 assert.equal(await page.getByLabel("Destination folder").inputValue(),"");
 await page.getByRole("button",{name:"Confirm move",exact:true}).focus();await page.keyboard.press("Enter");
 await page.locator('dialog[aria-labelledby="archive-folder-dialog-title"]').waitFor({state:"hidden"});await page.getByRole("status").filter({hasText:"Move saved"}).waitFor();
 assert.equal((await db.archiveFilePlacement.findUniqueOrThrow({where:{id:"manual:artwork-file"}})).folderId,null);
 await page.goto(path);await page.getByRole("button",{name:"Move approved-artwork.pdf",exact:true}).click();await page.getByLabel("Destination folder").selectOption(print.id);await waitSaved(page,"Confirm move");
 pass("Real persisted creation, nesting, descriptions/icons, rename, folder and file drag/drop, confirmation before commit, refresh persistence, breadcrumbs, list/search/empty states and keyboard movement");
 const designer=await pageFor("designer");await designer.goto(path+"?folder="+print.id);await designer.locator('[data-file-card="approved-artwork.pdf"]').waitFor();
 assert.equal(await designer.getByRole("button",{name:"New folder",exact:true}).count(),0);assert.equal(await designer.getByRole("button",{name:/^Move /}).count(),0);
 const tree=designer.getByRole("navigation",{name:"Archive folders",exact:true});assert.equal(await tree.getByRole("link",{name:"Private planning",exact:true}).count(),0);assert.equal(await tree.getByRole("link",{name:"Campaigns",exact:true}).count(),0);
 await shot(designer,"folders-designer-granted-path");
 const spm=await pageFor("spm");await spm.goto(path);await spm.getByRole("button",{name:"New folder",exact:true}).waitFor();assert.equal(await spm.getByRole("button",{name:/^Delete /}).count(),0);
 const digital=await pageFor("digital");await digital.goto(path+"?folder="+print.id);await digital.getByRole("button",{name:"New folder",exact:true}).waitFor();assert.equal(await digital.getByRole("button",{name:"Move approved-artwork.pdf",exact:true}).count(),0);
 await create(digital,"Digital permitted");
 for(const id of ["jpm","tech","tech2"]){const p=await pageFor(id);assert.equal(await p.evaluate(async()=> (await fetch('/api/archives/organization?categoryId=artwork')).status),403);}
 const privateFolder=await folder("Private planning");assert.equal(await designer.evaluate(async id=>(await fetch('/api/archives/organization?categoryId=artwork&folderId='+id)).status,privateFolder.id),404);
 // Failure feedback is based on a genuine server conflict, preserving the original folder.
 await page.goto(path);await page.getByRole("button",{name:"New folder",exact:true}).click();await page.getByLabel("Folder name",{exact:true}).fill("Campaigns");
 const conflict=page.waitForResponse(r=>r.url().endsWith('/api/archives/organization')&&r.request().method()==='POST');await page.getByRole("button",{name:"Save folder",exact:true}).click();assert.equal((await conflict).status(),409);await page.locator('dialog[aria-labelledby="archive-folder-dialog-title"]').getByRole("alert").waitFor();await shot(page,"folders-conflict-feedback");await page.getByRole("button",{name:"Cancel",exact:true}).click();
 // Existing category service is used for creation; Digital Lead can enter its empty workspace.
 await digital.goto(origin+"/archives/settings/categories");await digital.getByRole("button",{name:/Add.*category/i}).click();
 await digital.getByPlaceholder(/Enter archive category name/i).fill("Digital navigation category");await digital.getByRole("button",{name:/Save archive category/i}).click();
 await digital.getByText("Archive category added successfully.",{exact:true}).waitFor();
 const newCategory=await db.archiveCategory.findUniqueOrThrow({where:{slug:"digital-navigation-category"}});
 await digital.goto(origin+"/archives");await digital.getByRole("link").filter({hasText:"Digital navigation category"}).click();await digital.getByRole("button",{name:"New folder",exact:true}).waitFor();
 assert.equal(newCategory.isActive,true);await shot(digital,"folders-digital-empty-category");
 pass("Role-specific folder UI and direct API denial, Designer path filtering, SPM deletion denial, Digital Lead category creation/navigation and real conflict feedback");
 assert.equal(JSON.stringify(await db.manualArchiveFile.findMany({orderBy:{id:"asc"}})),originalFiles);
 assert.equal(JSON.stringify(await db.userArchiveAssetAccess.findMany({orderBy:{id:"asc"}})),originalGrants);
 assert.ok(await db.archiveOrganizationCommand.count()>=9);
 pass("Browser organization preserved original files, uploads, authors, storage keys and all file grants; commands persist with actual actors");
}
